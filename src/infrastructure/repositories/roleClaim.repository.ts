import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { RoleClaim } from "../../domain/entities/identity/roleClaim.entity";
import { IRoleClaimRepository } from "../../domain/repositories/iroleClaim.repository";

export class RoleClaimRepository implements IRoleClaimRepository {

    constructor(
        @InjectRepository(RoleClaim) private readonly roleClaimContext: Repository<RoleClaim>
    ) { }

    public async createAsync(claim: RoleClaim): Promise<RoleClaim> {
        return await this.roleClaimContext.save(claim);
    }

    public async getByRoleIdAsync(roleId: string): Promise<RoleClaim[]> {
        return await this.roleClaimContext.find({ where: { roleId } });
    }
}