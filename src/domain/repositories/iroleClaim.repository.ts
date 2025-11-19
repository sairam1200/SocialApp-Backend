import { RoleClaim } from "../entities/identity/roleClaim.entity";

export interface IRoleClaimRepository {

    createAsync(claim: RoleClaim): Promise<RoleClaim>;
    getByRoleIdAsync(roleId: string): Promise<RoleClaim[]>;
}