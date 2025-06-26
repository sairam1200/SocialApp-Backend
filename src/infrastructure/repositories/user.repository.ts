import * as bcrypt from 'bcrypt';
import _const from '../../core/utils/const';
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { cryptoUtils } from '../../core/utils/crypto.util';
import { BadRequestException, forwardRef, Inject, Injectable } from "@nestjs/common";
import { User, UserClaim, UserRole } from '../../domain/entities';
import { generateTimestampUUID } from '../../core/utils/time.util';
import { IRoleRepository, IUserRepository, IUserRoleRepository } from '../../domain/repositories';
import { RoleNotFoundException, ClaimAlreadyExistsException, ApplicationException, UserAlreadyExistsException, UserAlreadyInRoleException, UserNotFoundException, ClaimNotFoundException } from "../../core/exceptions";
import configs from 'configs';

@Injectable()
export class UserRepository implements IUserRepository {

  constructor(
    @InjectRepository(User) private readonly userContext: Repository<User>,
    @InjectRepository(UserClaim) private readonly userClaimContext: Repository<UserClaim>,
    @Inject(forwardRef(() => _const.IROLE_REPOSITORY)) private readonly roleRepository: IRoleRepository,
    @Inject(forwardRef(() => _const.IUSERROLE_REPOSITORY)) private readonly userRoleRepository: IUserRoleRepository
  ) { }

  public async getAsync(): Promise<User[]> {
    return await this.userContext.find();
  }

  public async createAsync(user: User, password: string): Promise<User> {

    if (await this.getUserByEmailAsync(user.email)) {
      throw new UserAlreadyExistsException(user.email, 'email');
    }

    if (await this.getUserByNameAsync(user.userName)) {
      throw new UserAlreadyExistsException(user.userName, 'username');
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

    const existingUserByUsername = await this.getUserByNameAsync(user.userName);
    if (existingUserByUsername && existingUserByUsername.id !== user.id) {
      throw new UserAlreadyExistsException(user.userName, 'username')
    }

    user.concurrencyStamp = generateTimestampUUID();
    const result = await this.userContext.update(user.id, user);
    return result.affected > 0;
  }

  // TODO: Carry out checks before proceeding.
  public async deleteAsync(user: User): Promise<void> {
    // TODO: Handle proper delete 
    await this.userContext.remove(user);
  }

  public async getUserByIdAsync(id: string): Promise<User | null> {
    return await this.userContext.findOne({ where: { id } });
  }

  public async getUserByEmailAsync(email: string): Promise<User | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.userContext.findOne({ where: { normalizedEmail } });
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

    user.securityStamp = cryptoUtils.generateEncryptionKey(32);
    const updateResult = await this.userContext.update(user.id, user);

    return updateResult.affected > 0;
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
    user.emailConfirmed = false;
    user.normalizedEmail = email.toUpperCase();
    user.concurrencyStamp = generateTimestampUUID();
    const result = await this.userContext.update(user.id as string | number, user as any);
    return result.affected > 0;
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

    const result = await this.userClaimContext.update(existingClaim.id, existingClaim);
    return result.affected > 0;
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