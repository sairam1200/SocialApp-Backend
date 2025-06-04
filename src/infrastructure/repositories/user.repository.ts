import * as bcrypt from 'bcrypt';
import _const from '../../core/utils/const';
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { User } from "../../domain/entities/user.entity";
import { cryptoUtils } from '../../core/utils/crypto.util';
import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { UserRole } from '../../domain/entities/userRole.entity';
import { generateTimestampUUID } from '../../core/utils/time.util';
import { IRoleRepository } from '../../domain/repositories/irole.repository';
import { IUserRepository } from "../../domain/repositories/iuser.repository";
import { RoleNotFoundException } from '../../core/exceptions/role.exception';
import ApplicationException from '../../core/exceptions/application.exception';
import { IUserRoleRepository } from '../../domain/repositories/iuserRole.repository';
import { UserAlreadyExistsException, UserAlreadyInRoleException, UserNotFoundException } from "../../core/exceptions/user.exception";

@Injectable()
export class UserRepository implements IUserRepository {

  constructor(
    @InjectRepository(User) private readonly userContext: Repository<User>,
    @Inject(forwardRef(() => _const.IROLE_REPOSITORY)) private readonly roleRepository: IRoleRepository,
    @Inject(forwardRef(() => _const.IUSERROLE_REPOSITORY)) private readonly userRoleRepository: IUserRoleRepository
  ) { }

  public async getAsync(): Promise<User[]> {
    return await this.userContext.find();
  }

  public async createAsync(user: User, password: string): Promise<User> {

    if (await this.getUserByEmailAsync(user.email)) {
      throw new UserAlreadyExistsException(user.email);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.passwordHash = hashedPassword;
    }

    user.concurrencyStamp = generateTimestampUUID();
    user.securityStamp = cryptoUtils.generateEncryptionKey();
    return await this.userContext.save(user);
  }

  public async updateAsync(user: User): Promise<void> {
    user.concurrencyStamp = generateTimestampUUID();
    await this.userContext.update(user.id, user);
  }

  // TODO: Carry out checks before proceeding.
  public async deleteAsync(user: User): Promise<User> {

    return await this.userContext.remove(user);
  }

  public async getUserByIdAsync(id: string): Promise<User | null> {
    return await this.userContext.findOne({ where: { id } });
  }

  public async getUserByEmailAsync(email: string): Promise<User | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.userContext.findOne({ where: { normalizedEmail } });
  }

  public async getEntries(
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

}