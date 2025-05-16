import configs from '../../configs';
import _const from '../../core/utils/const';
import { Globals } from '../../core/globals';
import { Injectable, Inject } from '@nestjs/common';
import { RoleType, UserType } from '../../domain/enums';
import { User } from '../../domain/entities/user.entity';
import { Role } from '../../domain/entities/role.entity';
import { Permissions } from '../../core/utils/permissions.util';
import { RoleClaim } from '../../domain/entities/roleClaim.entity';
import { IUserRepository } from '../../domain/repositories/iuser.repository';
import { IRoleRepository } from '../../domain/repositories/irole.repository';
import { IRoleClaimRepository } from '../../domain/repositories/iroleClaim.repository';

@Injectable()
export class DataSeeder {
    constructor(
        private readonly permissions: Permissions,
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(_const.IROLE_REPOSITORY) private readonly roleRepository: IRoleRepository,
        @Inject(_const.IROLECLAIM_REPOSITORY) private readonly roleClaimRepository: IRoleClaimRepository,
    ) { }

    async initializeAsync(): Promise<void> {
        await this.addAdministratorUserAndRoleAsync();

        if (configs.env === 'development') {

            await this.addGuestUserAsync();
        }
    }

    private async addAdministratorUserAndRoleAsync(): Promise<void> {

        await this.addAdministratorRoleAsync();

        const SYSTEM_ADMIN = new User({
            firstName: 'System',
            lastName: 'Admin',
            email: 'team@gaddr.com',
            emailConfirmed: true,
            type: UserType.Admin,
            createdBy: 'team@gaddr.com',
        });

        if (!(await this.userRepository.getUserByEmailAsync(SYSTEM_ADMIN.email))) {

            await this.userRepository.createAsync(SYSTEM_ADMIN, "@Admin@123");

            await this.userRepository.addToRoleAsync(SYSTEM_ADMIN, Globals.Roles.Admin);
        }
    }

    private async addGuestUserAsync(): Promise<void> {

        const JOHN_DOE = new User({
            firstName: 'John',
            lastName: 'Doe',
            email: 'johndoe@gaddr.com',
            emailConfirmed: true,
            createdBy: 'team@gaddr.com',
        });

        if (!(await this.userRepository.getUserByEmailAsync(JOHN_DOE.email))) {
            await this.userRepository.createAsync(JOHN_DOE, "@Abc@123");
        }
    }

    private async addAdministratorRoleAsync() {

        let adminRoleInDb = await this.roleRepository.getByNameAsync(Globals.Roles.Admin);

        if (!adminRoleInDb) {
            adminRoleInDb = await this.roleRepository.createAsync(new Role({
                name: "Admin",
                type: RoleType.System,
                createdBy: 'team@gaddr.com',
                description: "Administrator role with full permissions",
            }));
        }

        /// TODO: add all system permissions to this role.
        this.permissions.discoverControllerPermissions().map(async (permission) => {
            const hasClaim = adminRoleInDb.roleClaims?.some(claim => claim.claimValue === permission);
            if (!hasClaim) {
                await this.roleClaimRepository.createAsync(new RoleClaim({
                    claimValue: permission,
                    roleId: adminRoleInDb.id,
                    claimType: Globals.ClaimTypes.Permission
                }));
            }
        });

    }
} 