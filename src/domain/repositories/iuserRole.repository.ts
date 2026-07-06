import { UserRole } from '../entities/identity/userRole.entity';

export interface IUserRoleRepository {
  getByUserId(userId: string): Promise<UserRole[]>;
  getByRoleId(roleId: string): Promise<UserRole[]>;

  createAsync(userRole: UserRole): Promise<UserRole>;
  updateAsync(userRole: UserRole): Promise<void>;
  deleteAsync(userRole: UserRole): Promise<UserRole>;

  getAsync(userId: string, roleId: string): Promise<UserRole>;
}
