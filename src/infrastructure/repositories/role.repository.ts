import { In, Repository } from "typeorm";
import _const from "../../core/utils/const";
import { Globals } from "../../core/globals";
import { InjectRepository } from "@nestjs/typeorm";
import { User, Role } from "../../domain/entities";
import { Inject, Injectable } from "@nestjs/common";
import { RoleAlreadyExistsException } from "../../core/exceptions";
import { IUserRepository, IRoleRepository } from "../../domain/repositories";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";

@Injectable()
export class RoleRepository implements IRoleRepository {

    constructor(
        @InjectRepository(Role) private readonly roleContext: Repository<Role>,
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository
    ) { }

    public async getAsync(): Promise<Role[]> {
        return await this.roleContext.find();
    }

    public async getByIdAsync(roleId: string): Promise<Role | null> {
        return await this.roleContext.findOne({ where: { id: roleId } });
    }

    public async getByNameAsync(roleName: string): Promise<Role | null> {
        const normalizedName = roleName.toUpperCase();
        return await this.roleContext.findOne(
            {
                where: { normalizedName: normalizedName },
                relations: ['roleClaims']
            });
    }

    public async getByUserAsync(user: User): Promise<Role[]> {
        const roleNames = await this.userRepository.getRolesAsync(user);

        if (roleNames.length === 0) {
            return [];
        }

        return await this.roleContext.find({
            where: { name: In(roleNames) },
            relations: ['roleClaims']
        });
    }

    public async createAsync(role: Role): Promise<Role> {
        if (await this.getByNameAsync(role.name)) {
            throw new RoleAlreadyExistsException(role.name);
        }

        if (HttpContext.user) {
            const userId = HttpContext.user[Globals.ClaimTypes.UserId];
            role.setCurrentUser(userId);
        }

        return await this.roleContext.save(role);
    }

    public async updateAsync(role: Role): Promise<void> {
        if (HttpContext.user) {
            const userId = HttpContext.user[Globals.ClaimTypes.UserId];
            role.setCurrentUser(userId);
        }

        await this.roleContext.save(role);
    }

    public async deleteAsync(role: Role): Promise<void> {
        await this.roleContext.remove(role);
    }
}