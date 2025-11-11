import { User, Role } from "../entities";

export interface IRoleRepository {

    createAsync(role: Role): Promise<Role>;
    updateAsync(role: Role): Promise<void>;
    deleteAsync(role: Role): Promise<void>;

    getAsync(): Promise<Role[]>;
    getByUserAsync(user: User): Promise<Role[]>;
    getByIdAsync(roleId: string): Promise<Role | null>;
    getByNameAsync(roleName: string): Promise<Role | null>;
}