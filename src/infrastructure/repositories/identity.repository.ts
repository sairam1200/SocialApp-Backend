import * as bcrypt from 'bcrypt';
import configs from '../../configs';
import _const from '../../core/utils/const';
import redis from '../../core/utils/redis.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, SelectQueryBuilder } from 'typeorm';
import { cryptoUtils } from '../../core/utils/crypto.util';
import {
  User,
  UserClaim,
  UserRole,
  UserBiometric,
} from '../../domain/entities';
import { ProfileImagePrivacy, UserType } from '../../domain/enums';
import { generateTimestampUUID } from '../../core/utils/time.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  IRoleRepository,
  IIdentityRepository,
  IUserRoleRepository,
} from '../../domain/repositories';
import {
  SearchUserProjection,
  UserProfileStats,
} from '../../domain/repositories/iidentity.repository';
import {
  RoleNotFoundException,
  ClaimAlreadyExistsException,
  ApplicationException,
  UserAlreadyExistsException,
  UserAlreadyInRoleException,
  ClaimNotFoundException,
} from '../../core/exceptions';

@Injectable()
export class IdentityRepository implements IIdentityRepository {
  constructor(
    @InjectRepository(User) private readonly userContext: Repository<User>,
    @InjectRepository(UserClaim)
    private readonly userClaimContext: Repository<UserClaim>,
    @InjectRepository(UserBiometric)
    private readonly userBiometricsContext: Repository<UserBiometric>,
    @Inject(forwardRef(() => _const.IROLE_REPOSITORY))
    private readonly roleRepository: IRoleRepository,
    @Inject(forwardRef(() => _const.IUSERROLE_REPOSITORY))
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  public async getSimilarUserNamesAsync(userName: string): Promise<string[]> {
    const users = await this.userContext.find({
      where: { userName: Like(`%${userName}%`) },
      select: ['userName'],
    });
    return users.map((user) => user.userName);
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
      throw new UserAlreadyExistsException(user.email, 'email');
    }

    if (user.userName) {
      const existingUserByUsername = await this.getUserByNameAsync(
        user.userName,
      );
      if (existingUserByUsername && existingUserByUsername.id !== user.id) {
        throw new UserAlreadyExistsException(user.userName, 'username');
      }
    }

    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    const key = redis.getRedisKey<string>(
      `${user.id}${_const.REDIS.USER.ACCOUNT}`,
    );
    await redis.storeInRedisAsync(
      key,
      {
        concurrencyStamp: user.concurrencyStamp,
        securityStamp: user.securityStamp,
        useronboardingStep: user.onboardingStep,
      },
      _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
    );
    return true;
  }

  public async cacheUserAccountAsync(user: User, ttl?: number): Promise<void> {
    const key = redis.getRedisKey<string>(
      `${user.id}${_const.REDIS.USER.ACCOUNT}`,
    );
    const cacheTtl = ttl ?? _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC;
    await redis.storeInRedisAsync(
      key,
      {
        concurrencyStamp: user.concurrencyStamp,
        securityStamp: user.securityStamp,
        useronboardingStep: user.onboardingStep,
      },
      cacheTtl,
    );
  }

  // TODO: Carry out checks before proceeding.
  public async deleteAsync(user: User): Promise<void> {
    const key = redis.getRedisKey<string>(
      `${user.id}${_const.REDIS.USER.ACCOUNT}`,
    );
    await redis.removeFromRedisAsync(key);
    // TODO: Handle proper delete
    await this.userContext.remove(user);
  }

  public async getUserByIdAsync(id: string): Promise<User | null> {
    return await this.userContext.findOne({
      where: { id },
      relations: { biometrics: true },
    });
  }

  public async getUserByGoogleIdAsync(googleId: string): Promise<User | null> {
    return await this.userContext.findOne({
      where: { googleId },
      relations: { biometrics: true },
    });
  }

  public async getUserByEmailAsync(
    email: string,
    includeNewEmail?: boolean,
  ): Promise<User | null> {
    const normalizedEmail = email?.toUpperCase();
    const user = await this.userContext.findOne({
      where: { normalizedEmail },
      relations: { biometrics: true },
    });

    if (user || !includeNewEmail) {
      return user;
    }

    return await this.userContext
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.biometrics', 'biometrics')
      .where('LOWER(user.newEmail) = LOWER(:email)', { email })
      .getOne();
  }

  public async getUserByNameAsync(userName: string): Promise<User | null> {
    const normalizedUserName = userName?.toUpperCase();
    return await this.userContext.findOne({
      where: { normalizedUserName },
      relations: ['biometrics'],
    });
  }

  public async getEntriesAsync(
    page: number,
    pageSize: number,
    orderBy: string,
    order: 'ASC' | 'DESC',
    searchTerm?: string,
  ): Promise<[User[], number]> {
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const queryBuilder: SelectQueryBuilder<User> = this.userContext
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.biometrics', 'biometrics')
      .orderBy(`user.${orderBy}`, order)
      .skip(skip)
      .take(take);

    // Apply filter criteria to the query
    if (searchTerm) {
      queryBuilder.andWhere('user.email LIKE :email', {
        email: `%${searchTerm}%`,
      });
    }

    return await queryBuilder.getManyAndCount();
  }

  public async getDiscoverCreatorsAsync(
    page: number,
    pageSize: number,
    viewerUserId?: string,
  ): Promise<[User[], number]> {
    const skip = (page - 1) * pageSize;
    const queryBuilder = this.userContext
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.biometrics', 'biometrics')
      .where('user.type = :type', { type: UserType.User })
      .andWhere('user.isActive = true');

    if (viewerUserId) {
      queryBuilder.andWhere(
        `(user.profilePrivacy = 'Public' OR user.id = CAST(:viewerUserId AS uuid) OR EXISTS (
            SELECT 1 FROM "identity"."user_follows" f
            WHERE f."followerId" = CAST(:viewerUserId AS uuid)
              AND f."followedId" = user.id AND f.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      queryBuilder.andWhere("user.profilePrivacy = 'Public'");
    }

    queryBuilder.orderBy('user.registeredOn', 'DESC').skip(skip).take(pageSize);

    return queryBuilder.getManyAndCount();
  }

  public async searchGlobalAsync(
    keyword: string,
    viewerUserId: string | null,
    page: number,
    limit: number,
  ): Promise<[SearchUserProjection[], number]> {
    const escapedKeyword = keyword.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escapedKeyword}%`;
    const matches = `(user.firstName ILIKE :pattern ESCAPE '\\' OR user.lastName ILIKE :pattern ESCAPE '\\' OR user.userName ILIKE :pattern ESCAPE '\\')`;
    const qb = this.userContext
      .createQueryBuilder('user')
      .select([
        'user.id AS id',
        'user.firstName AS "firstName"',
        'user.lastName AS "lastName"',
        'user.userName AS "userName"',
        'user.bio AS bio',
        'biometrics."profileImageUrl" AS "profileImageUrl"',
        'biometrics."defaultProfileImageUrl" AS "defaultProfileImageUrl"',
        'biometrics.privacy AS "profileImagePrivacy"',
      ])
      .leftJoin(UserBiometric, 'biometrics', 'biometrics."userId" = user.id')
      .where('user.isActive = true')
      .andWhere('user.type = :userType', { userType: UserType.User })
      .andWhere(matches, { pattern });

    if (viewerUserId) {
      qb.andWhere(
        `(user.profilePrivacy = 'Public' OR user.id = CAST(:viewerUserId AS uuid) OR EXISTS (
            SELECT 1 FROM "identity"."user_follows" f
            WHERE f."followerId" = CAST(:viewerUserId AS uuid)
              AND f."followedId" = user.id AND f.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      qb.andWhere("user.profilePrivacy = 'Public'");
    }

    qb.orderBy(
      `CASE
        WHEN LOWER(user.userName) = LOWER(:keyword)
          OR LOWER(CONCAT_WS(' ', user.firstName, user.lastName)) = LOWER(:keyword) THEN 0
        WHEN user.userName ILIKE :prefix ESCAPE '\\'
          OR user.firstName ILIKE :prefix ESCAPE '\\' OR user.lastName ILIKE :prefix ESCAPE '\\' THEN 1
        ELSE 2 END`,
      'ASC',
    )
      .addOrderBy('user.userName', 'ASC')
      .setParameters({ keyword, prefix: `${escapedKeyword}%` });
    const countQb = this.userContext
      .createQueryBuilder('user')
      .where('user.isActive = true')
      .andWhere('user.type = :userType', { userType: UserType.User })
      .andWhere(matches, { pattern });

    if (viewerUserId) {
      countQb.andWhere(
        `(user.profilePrivacy = 'Public' OR user.id = CAST(:viewerUserId AS uuid) OR EXISTS (
            SELECT 1 FROM "identity"."user_follows" f
            WHERE f."followerId" = CAST(:viewerUserId AS uuid)
              AND f."followedId" = user.id AND f.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      countQb.andWhere("user.profilePrivacy = 'Public'");
    }

    const [countSqlStr, countParams] = countQb.getQueryAndParameters();
    const wrappedSql = `SELECT COUNT(1) AS "cnt" FROM (${countSqlStr}) AS "_sub"`;
    const countResult = await this.userContext.query(wrappedSql, countParams);
    const count = parseInt(countResult[0].cnt, 10);
    const rows = await qb
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<
        Pick<
          SearchUserProjection,
          | 'id'
          | 'firstName'
          | 'lastName'
          | 'userName'
          | 'bio'
          | 'profileImageUrl'
          | 'defaultProfileImageUrl'
          | 'profileImagePrivacy'
        >
      >();

    if (rows.length === 0) return [[], count];

    const userIds = rows.map((r) => r.id);
    const statsMap = await this.getUsersProfileStatsAsync(
      userIds,
      viewerUserId,
    );

    const results: SearchUserProjection[] = rows.map((row) => {
      const stats = statsMap.get(row.id);
      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        userName: row.userName,
        bio: row.bio,
        profileImage:
          row.profileImageUrl ?? row.defaultProfileImageUrl ?? undefined,
        profileImageUrl: row.profileImageUrl ?? null,
        defaultProfileImageUrl: row.defaultProfileImageUrl ?? null,
        profileImagePrivacy: row.profileImagePrivacy ?? 'Everyone',
        followersCount: stats?.followersCount ?? 0,
        followingCount: stats?.followingCount ?? 0,
        totalPosts: stats?.totalPosts ?? 0,
        linkedAccounts: stats?.linkedAccounts ?? [],
        verified: stats?.verified ?? false,
        isFollowing: stats?.isFollowing,
      };
    });

    return [results, count];
  }

  public async getUsersProfileStatsAsync(
    userIds: string[],
    viewerUserId?: string | null,
  ): Promise<Map<string, UserProfileStats>> {
    if (userIds.length === 0) return new Map();

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const params: unknown[] = [...userIds];

    let isFollowingExpr = 'NULL::boolean';
    if (viewerUserId) {
      params.push(viewerUserId);
      isFollowingExpr = `(SELECT EXISTS(SELECT 1 FROM "identity"."user_follows" f WHERE f."followerId" = $${params.length} AND f."followedId" = "user".id AND f.status = 'accepted'))`;
    }

    const sql = `
      SELECT
        "user".id AS "userId",
        (SELECT COUNT(1) FROM "identity"."user_follows" f WHERE f."followedId" = "user".id AND f.status = 'accepted') AS "followersCount",
        (SELECT COUNT(1) FROM "identity"."user_follows" f WHERE f."followerId" = "user".id AND f.status = 'accepted') AS "followingCount",
        (SELECT COALESCE(json_agg(json_build_object('id', la.id, 'platform', la.platform, 'verified', la.verified, 'username', la."userName") ORDER BY la.platform) FILTER (WHERE la.id IS NOT NULL), '[]'::json) FROM "linkedAccounts" la WHERE la."userId" = "user".id) AS "linkedAccounts",
        (SELECT EXISTS(SELECT 1 FROM "linkedAccounts" la WHERE la."userId" = "user".id AND la.verified = true)) AS "verified",
        (SELECT COUNT(*) FROM "userContents" uc WHERE uc."userId" = "user".id) AS "totalPosts",
        ${isFollowingExpr} AS "isFollowing"
      FROM "identity"."users" "user"
      WHERE "user".id IN (${placeholders})
    `;

    const rows: Record<string, unknown>[] = await this.userContext.query(
      sql,
      params,
    );

    const statsMap = new Map<string, UserProfileStats>();
    for (const row of rows) {
      const linkedAccounts =
        typeof row.linkedAccounts === 'string'
          ? JSON.parse(row.linkedAccounts as string)
          : (row.linkedAccounts as UserProfileStats['linkedAccounts']) || [];

      statsMap.set(row.userId as string, {
        totalPosts: parseInt(String(row.totalPosts), 10) || 0,
        followersCount: parseInt(String(row.followersCount), 10) || 0,
        followingCount: parseInt(String(row.followingCount), 10) || 0,
        linkedAccounts,
        verified: row.verified === true || row.verified === 'true',
        isFollowing:
          row.isFollowing != null
            ? row.isFollowing === true || row.isFollowing === 'true'
            : undefined,
      });
    }

    return statsMap;
  }

  public async checkPasswordAsync(
    user: User,
    password: string,
  ): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash!);
  }

  public async changePasswordAsync(
    user: User,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    if (currentPassword === newPassword) {
      throw new ApplicationException(
        'The new password cannot be the same as the current password.',
      );
    }

    const isCurrentPasswordValid = await this.checkPasswordAsync(
      user,
      currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new ApplicationException('The current password is incorrect.');
    }

    return await this.updatePassword(user, newPassword);
  }

  public async updatePassword(
    user: User,
    newPassword: string,
  ): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hashedPassword;
    user.lastPasswordModifiedAt = new Date();
    user.securityStamp = cryptoUtils.generateEncryptionKey(32);
    await this.userContext.save(user);
    const key = redis.getRedisKey<string>(
      `${user.id}${_const.REDIS.USER.ACCOUNT}`,
    );
    await redis.removeFromRedisAsync(key);

    return true;
  }

  public async isEmailInuseAsync(email: string): Promise<boolean> {
    const normalizedEmail = email?.toUpperCase();
    const currentUserId = HttpContext.getCurrentUserId;

    const userByEmail = await this.userContext.findOne({
      where: { normalizedEmail },
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

  public async cleanupExpiredEmailChangesAsync(
    expirationHours: number = 24,
  ): Promise<number> {
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

      throw new BadRequestException(
        'This email is already associated with another account.',
      );
    }

    user.email = email;
    user.newEmail = null;
    user.emailConfirmed = true;
    user.normalizedEmail = email.toUpperCase();
    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    return true;
  }

  public async changeEmailAsync(
    newEmail: string,
    token: string,
  ): Promise<boolean> {
    const purpose = _const.TOKEN.PURPOSE.CONFIRM_EMAIL + ':' + newEmail;
    const { isValid, userId } = await this.verifyUserTokenAsync(purpose, token);
    const user = await this.getUserByIdAsync(userId);

    if (!isValid || !user) {
      throw new BadRequestException(
        'The provided token is invalid or expired.',
      );
    }

    return await this.setEmailAsync(user, newEmail);
  }

  public async setPhoneNumberAsync(
    user: User,
    phoneNumber: string,
  ): Promise<boolean> {
    user.phoneNumber = phoneNumber;
    user.newPhoneNumber = null;
    user.lastPhoneNumberModifiedAt = new Date();
    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.save(user);
    return true;
  }

  public async changePhoneNumberAsync(
    newPhoneNumber: string,
    token: string,
  ): Promise<boolean> {
    const purpose = _const.TOKEN.PURPOSE.CONFIRM_PHONE + ':' + newPhoneNumber;
    const { isValid, userId } = await this.verifyUserTokenAsync(purpose, token);
    const user = await this.getUserByIdAsync(userId);

    if (!isValid || !user) {
      throw new BadRequestException(
        'The provided token is invalid or expired.',
      );
    }

    if (user.newPhoneNumber !== newPhoneNumber) {
      throw new BadRequestException(
        'The phone number does not match the pending change request.',
      );
    }

    return await this.setPhoneNumberAsync(user, newPhoneNumber);
  }

  public async generatePhoneConfirmationTokenAsync(
    user: User,
    newPhoneNumber: string,
  ): Promise<string> {
    return await this.generateUserTokenAsync(
      user,
      _const.TOKEN.PURPOSE.CONFIRM_PHONE + ':' + newPhoneNumber,
    );
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
      }),
    );

    return roleNames.filter((name) => name !== null) as string[];
  }

  public async addToRoleAsync(
    user: User,
    roleName: string,
  ): Promise<UserRole | null> {
    if (await this.isInRoleAsync(user, roleName)) {
      throw new UserAlreadyInRoleException(user.email, '', roleName);
    }

    const role = await this.roleRepository.getByNameAsync(roleName);
    const userRole = new UserRole({
      userId: user.id,
      roleId: role.id,
    });

    user.concurrencyStamp = generateTimestampUUID();
    await this.updateAsync(user);

    return await this.userRoleRepository.createAsync(userRole);
  }

  public async isInRoleAsync(
    user: User,
    roleName: string,
  ): Promise<UserRole | null> {
    const role =
      (await this.roleRepository.getByNameAsync(roleName)) ??
      (() => {
        throw new RoleNotFoundException('', roleName);
      })();

    return await this.userRoleRepository.getAsync(user.id, role.id);
  }

  public async getClaimsAsync(user: User): Promise<UserClaim[]> {
    return await this.userClaimContext.find({ where: { userId: user.id } });
  }

  public async addClaimAsync(user: User, claim: UserClaim): Promise<UserClaim> {
    const existingClaim = await this.userClaimContext.findOne({
      where: {
        userId: user.id?.toString(),
        claimType: claim.claimType,
        claimValue: claim.claimValue,
      },
    });

    if (existingClaim) {
      throw new ClaimAlreadyExistsException(claim.claimType);
    }

    return await this.userClaimContext.save(claim);
  }

  public async addClaimsAsync(
    user: User,
    claims: UserClaim[],
  ): Promise<UserClaim[]> {
    const resultList: UserClaim[] = [];
    for (const claim of claims) {
      const result = await this.addClaimAsync(user, claim);
      resultList.push(result);
    }

    return resultList;
  }

  public async removeClaimAsync(
    user: User,
    claim: UserClaim,
  ): Promise<boolean> {
    const existingClaim = await this.userClaimContext.findOne({
      where: {
        userId: user.id?.toString(),
        claimType: claim.claimType,
        claimValue: claim.claimValue,
      },
    });

    if (!existingClaim) {
      throw new ClaimNotFoundException();
    }

    const result = await this.userClaimContext.delete(existingClaim);
    return result.affected > 0;
  }

  public async removeClaimsAsync(
    user: User,
    claims: UserClaim[],
  ): Promise<{ claimType: string; succeeded: boolean }[]> {
    const resultList: { claimType: string; succeeded: boolean }[] = [];
    for (const claim of claims) {
      const result = await this.removeClaimAsync(user, claim);
      resultList.push({ succeeded: result, claimType: claim.claimType });
    }

    return resultList;
  }

  public async replaceClaimAsync(
    user: User,
    claim: UserClaim,
    newClaim: UserClaim,
  ): Promise<boolean> {
    const existingClaim = await this.userClaimContext.findOne({
      where: {
        userId: user.id?.toString(),
        claimType: claim.claimType,
        claimValue: claim.claimValue,
      },
    });

    if (!existingClaim) {
      throw new ClaimNotFoundException();
    }

    existingClaim.claimType = newClaim.claimType;
    existingClaim.claimValue = newClaim.claimValue;

    await this.userClaimContext.save(existingClaim);
    return true;
  }

  public async generateUserTokenAsync(
    user: User,
    purpose: string,
  ): Promise<string> {
    const expiresAt =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    const tokenPayload = { userId: user.id, purpose, expiresAt };

    return cryptoUtils.encrypt(JSON.stringify(tokenPayload));
  }

  public async generatePasswordResetTokenAsync(user: User): Promise<string> {
    return await this.generateUserTokenAsync(
      user,
      _const.TOKEN.PURPOSE.RESET_PASSWORD,
    );
  }

  public async generateEmailConfirmationTokenAsync(
    user: User,
    newEmail: string,
  ): Promise<string> {
    return await this.generateUserTokenAsync(
      user,
      _const.TOKEN.PURPOSE.CONFIRM_EMAIL + ':' + newEmail,
    );
  }

  public async verifyUserTokenAsync(
    purpose: string,
    token: string,
  ): Promise<{ isValid: boolean; userId: string }> {
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
  public async getUserBiometricAsync(
    userId: string,
  ): Promise<UserBiometric | null> {
    return await this.userBiometricsContext.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  public async upsertUserBiometricAsync(
    userId: string,
    biometrics: UserBiometric,
  ): Promise<UserBiometric> {
    const existing = await this.getUserBiometricAsync(userId);
    if (existing) {
      existing.profileImageUrl =
        biometrics.profileImageUrl ?? existing.profileImageUrl;
      existing.defaultProfileImageUrl =
        biometrics.defaultProfileImageUrl ?? existing.defaultProfileImageUrl;
      existing.privacy = biometrics.privacy ?? existing.privacy;
      const currentUserId = HttpContext.getCurrentUserId;
      if (currentUserId) {
        existing.setCurrentUser(currentUserId);
      }
      console.log('Incoming biometrics:', biometrics);
      console.log('profileImageUrl:', biometrics.profileImageUrl);
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

  public async updateUserBiometricPrivacyAsync(
    userId: string,
    privacy: ProfileImagePrivacy,
  ): Promise<boolean> {
    const biometrics = await this.getUserBiometricAsync(userId);
    if (!biometrics) {
      return false;
    }
    biometrics.privacy = privacy;
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

  // Referral Methods
  public async getUserByReferralCodeAsync(
    referralCode: string,
  ): Promise<User | null> {
    return await this.userContext.findOne({
      where: { referralCode },
      relations: { biometrics: true },
    });
  }

  public async generateReferralCodeAsync(user: User): Promise<string> {
    const { nanoid } = await import('nanoid');
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0/O, 1/I/L to avoid confusion
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = nanoid(8);
      // Build the code using the custom alphabet
      const referralCode = Array.from(
        { length: 8 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join('');

      const existing = await this.getUserByReferralCodeAsync(referralCode);
      if (!existing) {
        user.referralCode = referralCode;
        await this.userContext.save(user);
        return referralCode;
      }
    }

    throw new ApplicationException(
      'Unable to generate a unique referral code. Please try again.',
    );
  }
}
