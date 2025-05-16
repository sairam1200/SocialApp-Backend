import { Role } from "../entities/role.entity";
import { User } from "../entities/user.entity";
import { RoleClaim } from "../entities/roleClaim.entity";

export interface IRoleRepository {

    createAsync(role: Role): Promise<Role>;
    updateAsync(role: Role): Promise<void>;
    deleteAsync(role: Role): Promise<void>;

    getAsync(): Promise<Role[]>;
    getByUserAsync(user: User): Promise<Role[]>;
    getByIdAsync(roleId: string): Promise<Role | null>;
    getByNameAsync(roleName: string): Promise<Role | null>;
}