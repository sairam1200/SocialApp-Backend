import * as bcrypt from 'bcrypt';
import configs from '../../configs';
import _const from '../../core/utils/const';
import redis from '../../core/utils/redis.util';
import { InjectRepository } from "@nestjs/typeorm";
import { Like, Repository, SelectQueryBuilder } from "typeorm";
import { cryptoUtils } from '../../core/utils/crypto.util';
import { User, UserClaim, UserRole, UserBiometric } from '../../domain/entities';
import { ProfileImagePrivacy, ProfilePrivacy } from '../../domain/enums';
import { generateTimestampUUID } from '../../core/utils/time.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { BadRequestException, forwardRef, Inject, Injectable } from "@nestjs/common";
import { IRoleRepository, IUserRepository, IUserRoleRepository } from '../../domain/repositories';
import { RoleNotFoundException, ClaimAlreadyExistsException, ApplicationException, UserAlreadyExistsException, UserAlreadyInRoleException, ClaimNotFoundException } from "../../core/exceptions";

@Injectable()
export class UserRepository implements IUserRepository {

  constructor(
    @InjectRepository(User) private readonly userContext: Repository<User>,
    @InjectRepository(UserClaim) private readonly userClaimContext: Repository<UserClaim>,
    @InjectRepository(UserBiometric) private readonly userBiometricsContext: Repository<UserBiometric>,
    @Inject(forwardRef(() => _const.IROLE_REPOSITORY)) private readonly roleRepository: IRoleRepository,
    @Inject(forwardRef(() => _const.IUSERROLE_REPOSITORY)) private readonly userRoleRepository: IUserRoleRepository
  ) { }

  public async getSimilarUserNamesAsync(userName: string): Promise<string[]> {
    const users = await this.userContext.find({
      where: { userName: Like(`%${userName}%`) },
      select: ['userName'],
    });
    return users.map(user => user.userName);
  }

  public async getAsync(): Promise<User[]> {
    return await this.userContext.find();
  }

  public async createAsync(user: User, password: string): Promise<User> {

    if (await this.getUserByEmailAsync(user.email)) {
      throw new UserAlreadyExistsException(user.email, 'email');
    }

    if (user.userName) {
      if (await this.getUserByNameAsync(user.userName)) {
        throw new UserAlreadyExistsException(user.userName, 'username');
      }
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.passwordHash = hashedPassword;
    }

    user.concurrencyStamp = generateTimestampUUID();
    user.securityStamp = cryptoUtils.generateEncryptionKey();
    return await this.userContext.save(user);
  }

  public async updateAsync(user: User): Promise<boolean> {

    const existingUserByEmail = await this.getUserByEmailAsync(user.email);
    if (existingUserByEmail && existingUserByEmail.id !== user.id) {
      throw new UserAlreadyExistsException(user.email, 'email')
    }

    if (user.userName) {
      const existingUserByUsername = await this.getUserByNameAsync(user.userName);
      if (existingUserByUsername && existingUserByUsername.id !== user.id) {
        throw new UserAlreadyExistsException(user.userName, 'username')
      }
    }

    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    const key = redis.getRedisKey<string>(`${user.id}${_const.REDIS.USER.ACCOUNT}`);
    const existingCache = await redis.getFromRedisAsync(key);
    if (existingCache) {
      await redis.storeInRedisAsync(key, {
        concurrencyStamp: user.concurrencyStamp,
        securityStamp: user.securityStamp,
        // Add more user account related 
      }, _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC);
    }
    return true;
  }

  public async cacheUserAccountAsync(user: User, ttl?: number): Promise<void> {
    const key = redis.getRedisKey<string>(`${user.id}${_const.REDIS.USER.ACCOUNT}`);
    const cacheTtl = ttl ?? _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC;
    await redis.storeInRedisAsync(key, {
      concurrencyStamp: user.concurrencyStamp,
      securityStamp: user.securityStamp,
      // Add more user account related 
    }, cacheTtl);
  }

  // TODO: Carry out checks before proceeding.
  public async deleteAsync(user: User): Promise<void> {
    const key = redis.getRedisKey<string>(`${user.id}${_const.REDIS.USER.ACCOUNT}`);
    await redis.removeFromRedisAsync(key);
    // TODO: Handle proper delete 
    await this.userContext.remove(user);
  }

  public async getUserByIdAsync(id: string): Promise<User | null> {
    return await this.userContext.findOne({ where: { id } });
  }

  public async getUserByEmailAsync(email: string, includeNewEmail?: boolean): Promise<User | null> {
    const normalizedEmail = email?.toUpperCase();
    const user = await this.userContext.findOne({ where: { normalizedEmail } });

    if (user || !includeNewEmail) {
      return user;
    }

    return await this.userContext
      .createQueryBuilder('user')
      .where('LOWER(user.newEmail) = LOWER(:email)', { email })
      .getOne();
  }

  public async getUserByNameAsync(userName: string): Promise<User | null> {
    const normalizedUserName = userName?.toUpperCase();
    return await this.userContext.findOne({ where: { normalizedUserName } });
  }

  public async getEntriesAsync(
    page: number,
    pageSize: number,
    orderBy: string,
    order: "ASC" | "DESC",
    searchTerm?: string
  ): Promise<[User[], number]> {

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const queryBuilder: SelectQueryBuilder<User> = this.userContext
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.biometrics", "biometrics")
      .orderBy(`user.${orderBy}`, order)
      .skip(skip)
      .take(take);

    // Apply filter criteria to the query
    if (searchTerm) {
      queryBuilder.andWhere("user.email LIKE :email", { email: `%${searchTerm}%` });
    }

    return await queryBuilder.getManyAndCount();

  }

  public async checkPasswordAsync(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash!);
  }

  public async changePasswordAsync(user: User, currentPassword: string, newPassword: string): Promise<boolean> {

    if (currentPassword === newPassword) {
      throw new ApplicationException("The new password cannot be the same as the current password.")
    }

    const isCurrentPasswordValid = await this.checkPasswordAsync(user, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new ApplicationException('The current password is incorrect.');
    }

    return await this.updatePassword(user, newPassword);
  }

  public async updatePassword(user: User, newPassword: string): Promise<boolean> {

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.lastPasswordModifiedAt = new Date();
    user.securityStamp = cryptoUtils.generateEncryptionKey(32);
    await this.userContext.save(user);
    const key = redis.getRedisKey<string>(`${user.id}${_const.REDIS.USER.ACCOUNT}`);
    await redis.removeFromRedisAsync(key);

    return true;
  }

  public async isEmailInuseAsync(email: string): Promise<boolean> {
    const normalizedEmail = email?.toUpperCase();
    const currentUserId = HttpContext.getCurrentUserId;

    const userByEmail = await this.userContext.findOne({
      where: { normalizedEmail }
    });

    if (userByEmail) {
      if (currentUserId && userByEmail.id === currentUserId) {
        return false;
      }
      return true; // Email is in use by another user
    }

    const userByNewEmail = await this.userContext
      .createQueryBuilder('user')
      .where('LOWER(user.newEmail) = LOWER(:email)', { email })
      .getOne();

    if (userByNewEmail) {
      if (currentUserId && userByNewEmail.id === currentUserId) {
        return false;
      }
      return true; // Email is pending change for another user
    }

    return false; // Email is not in use
  }

  public async cleanupExpiredEmailChangesAsync(expirationHours: number = 24): Promise<number> {
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() - expirationHours);

    const result = await this.userContext
      .createQueryBuilder()
      .update(User)
      .set({
        newEmail: null,
      })
      .where('newEmail IS NOT NULL')
      .andWhere('lastEmailModifiedAt < :expirationDate', { expirationDate })
      .execute();

    return result.affected || 0;
  }

  public async setEmailAsync(user: User, email: string): Promise<boolean> {

    const duplicateUser = await this.getUserByEmailAsync(email);
    if (duplicateUser) {
      if (duplicateUser.id === user.id) {
        return true;
      }

      throw new BadRequestException("This email is already associated with another account.")
    }

    user.email = email;
    user.newEmail = null;
    user.emailConfirmed = true;
    user.normalizedEmail = email.toUpperCase();
    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    return true;
  }

  public async changeEmailAsync(newEmail: string, token: string): Promise<boolean> {

    const purpose = _const.TOKEN.PURPOSE.CONFIRM_EMAIL + ":" + newEmail;
    const { isValid, userId } = await this.verifyUserTokenAsync(purpose, token);
    const user = await this.getUserByIdAsync(userId);

    if (!isValid || !user) {
      throw new BadRequestException('The provided token is invalid or expired.');
    }

    return await this.setEmailAsync(user, newEmail);
  }

  public async setPhoneNumberAsync(user: User, phoneNumber: string): Promise<boolean> {
    user.phoneNumber = phoneNumber;
    user.newPhoneNumber = null;
    user.lastPhoneNumberModifiedAt = new Date();
    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    return true;
  }

  public async changePhoneNumberAsync(newPhoneNumber: string, token: string): Promise<boolean> {
    const purpose = _const.TOKEN.PURPOSE.CONFIRM_PHONE + ":" + newPhoneNumber;
    const { isValid, userId } = await this.verifyUserTokenAsync(purpose, token);
    const user = await this.getUserByIdAsync(userId);

    if (!isValid || !user) {
      throw new BadRequestException('The provided token is invalid or expired.');
    }

    if (user.newPhoneNumber !== newPhoneNumber) {
      throw new BadRequestException('The phone number does not match the pending change request.');
    }

    return await this.setPhoneNumberAsync(user, newPhoneNumber);
  }

  public async generatePhoneConfirmationTokenAsync(user: User, newPhoneNumber: string): Promise<string> {
    return await this.generateUserTokenAsync(user, _const.TOKEN.PURPOSE.CONFIRM_PHONE + ":" + newPhoneNumber);
  }

  public async getRolesAsync(user: User): Promise<string[]> {
    const userRoles = await this.userRoleRepository.getByUserId(user.id);
    if (!userRoles || userRoles.length === 0) {
      return [];
    }

    const roleNames = await Promise.all(
      userRoles.map(async (userRole: UserRole) => {
        const role = await this.roleRepository.getByIdAsync(userRole.roleId);
        return role?.name;
      })
    );

    return roleNames.filter(name => name !== null) as string[];
  }

  public async addToRoleAsync(user: User, roleName: string): Promise<UserRole | null> {

    if (await this.isInRoleAsync(user, roleName)) {
      throw new UserAlreadyInRoleException(user.email, '', roleName);
    }

    const role = await this.roleRepository.getByNameAsync(roleName);
    const userRole = new UserRole({
      userId: user.id,
      roleId: role.id
    });

    user.concurrencyStamp = generateTimestampUUID();
    await this.updateAsync(user);

    return await this.userRoleRepository.createAsync(userRole);
  }

  public async isInRoleAsync(user: User, roleName: string): Promise<UserRole | null> {

    const role = await this.roleRepository.getByNameAsync(roleName)
      ?? (() => { throw new RoleNotFoundException('', roleName); })();

    return await this.userRoleRepository.getAsync(user.id, role.id);
  }

  public async getClaimsAsync(user: User): Promise<UserClaim[]> {
    return await this.userClaimContext.find({ where: { userId: user.id } });
  }

  public async addClaimAsync(user: User, claim: UserClaim): Promise<UserClaim> {

    const existingClaim = await this.userClaimContext.findOne({
      where: { userId: user.id?.toString(), claimType: claim.claimType, claimValue: claim.claimValue }
    });

    if (existingClaim) {
      throw new ClaimAlreadyExistsException(claim.claimType);
    }

    return await this.userClaimContext.save(claim);
  }

  public async addClaimsAsync(user: User, claims: UserClaim[]): Promise<UserClaim[]> {

    const resultList: UserClaim[] = [];
    for (let claim of claims) {
      const result = await this.addClaimAsync(user, claim);
      resultList.push(result);
    }

    return resultList;
  }

  public async removeClaimAsync(user: User, claim: UserClaim): Promise<boolean> {

    const existingClaim = await this.userClaimContext.findOne({
      where: { userId: user.id?.toString(), claimType: claim.claimType, claimValue: claim.claimValue }
    });

    if (!existingClaim) {
      throw new ClaimNotFoundException()
    }

    const result = await this.userClaimContext.delete(existingClaim);
    return result.affected > 0;
  }

  public async removeClaimsAsync(user: User, claims: UserClaim[]): Promise<{ claimType: string; succeeded: boolean }[]> {

    const resultList: { claimType: string; succeeded: boolean }[] = [];
    for (let claim of claims) {
      const result = await this.removeClaimAsync(user, claim);
      resultList.push({ succeeded: result, claimType: claim.claimType, });
    }

    return resultList;
  }

  public async replaceClaimAsync(user: User, claim: UserClaim, newClaim: UserClaim): Promise<boolean> {

    const existingClaim = await this.userClaimContext.findOne({
      where: { userId: user.id?.toString(), claimType: claim.claimType, claimValue: claim.claimValue }
    });

    if (!existingClaim) {
      throw new ClaimNotFoundException()
    }

    existingClaim.claimType = newClaim.claimType;
    existingClaim.claimValue = newClaim.claimValue;

    await this.userClaimContext.save(existingClaim);
    return true;
  }

  public async generateUserTokenAsync(user: User, purpose: string): Promise<string> {

    const expiresAt = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    const tokenPayload = { userId: user.id, purpose, expiresAt };

    return cryptoUtils.encrypt(JSON.stringify(tokenPayload));
  }

  public async generatePasswordResetTokenAsync(user: User): Promise<string> {
    return await this.generateUserTokenAsync(user, _const.TOKEN.PURPOSE.RESET_PASSWORD);
  }

  public async generateEmailConfirmationTokenAsync(user: User, newEmail: string): Promise<string> {
    return await this.generateUserTokenAsync(user, _const.TOKEN.PURPOSE.CONFIRM_EMAIL + ":" + newEmail);
  }

  public async verifyUserTokenAsync(purpose: string, token: string): Promise<{ isValid: boolean, userId: string }> {
    const decryptedToken = this.decryptToken(token);
    if (!decryptedToken) {
      return { isValid: false, userId: '' }; // Token is invalid
    }

    const { userId, purpose: tokenPurpose, expiresAt } = decryptedToken;
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      return { isValid: false, userId: '' }; // Token has expired
    }

    return { isValid: tokenPurpose === purpose, userId };
  }

  // UserBiometric methods
  public async getUserBiometricAsync(userId: string): Promise<UserBiometric | null> {
    return await this.userBiometricsContext.findOne({ where: { userId }, relations: ['user'] });
  }

  public async upsertUserBiometricAsync(userId: string, biometrics: UserBiometric): Promise<UserBiometric> {
    const existing = await this.getUserBiometricAsync(userId);
    if (existing) {
      existing.profileImageUrl = biometrics.profileImageUrl ?? existing.profileImageUrl;
      existing.defaultProfileImageUrl = biometrics.defaultProfileImageUrl ?? existing.defaultProfileImageUrl;
      existing.privacy = biometrics.privacy ?? existing.privacy;
      const currentUserId = HttpContext.getCurrentUserId;
      if (currentUserId) {
        existing.setCurrentUser(currentUserId);
      }
      return await this.userBiometricsContext.save(existing);
    } else {
      biometrics.userId = userId;
      const currentUserId = HttpContext.getCurrentUserId;
      if (currentUserId) {
        biometrics.setCurrentUser(currentUserId);
      }
      return await this.userBiometricsContext.save(biometrics);
    }
  }

  public async updateUserBiometricPrivacyAsync(userId: string, privacy?: ProfileImagePrivacy, profilePrivacy?: ProfilePrivacy): Promise<boolean> {
    const biometrics = await this.getUserBiometricAsync(userId);
    if (!biometrics) {
      return false;
    }
    if (privacy !== undefined) {
      biometrics.privacy = privacy;
    }
    if (profilePrivacy !== undefined) {
      biometrics.profilePrivacy = profilePrivacy;
    }
    const currentUserId = HttpContext.getCurrentUserId;
    if (currentUserId) {
      biometrics.setCurrentUser(currentUserId);
    }
    await this.userBiometricsContext.save(biometrics);
    return true;
  }

  // Private Methods
  private decryptToken(token: string): any {
    try {
      const decrypted = cryptoUtils.decrypt(token);
      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  }
}