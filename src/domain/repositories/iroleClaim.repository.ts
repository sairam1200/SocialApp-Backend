import { RoleClaim } from "../entities/roleClaim.entity";

export interface IRoleClaimRepository {

    createAsync(claim: RoleClaim): Promise<RoleClaim>;
    getByRoleIdAsync(roleId: string): Promise<RoleClaim[]>;
}