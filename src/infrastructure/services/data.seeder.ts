import configs from '../../configs';
import _const from '../../core/utils/const';
import { Globals } from '../../core/globals';
import logger from '../../core/utils/winston.util';
import { Injectable, Inject } from '@nestjs/common';
import { RoleType, UserType } from '../../domain/enums';
import { stringUtil } from '../../core/utils/string.util';
import { User, Role, RoleClaim } from '../../domain/entities';
import { Permissions } from '../../core/utils/permissions.util';
import { generateInitialImage } from '../../core/utils/canvas.util';
import { uploadBase64ToCloudinaryAsync } from '../../core/utils/cloudinary.util';
import { IUserRepository, IRoleRepository, IRoleClaimRepository } from '../../domain/repositories';

@Injectable()
export class DataSeeder {
  constructor(
    private readonly permissions: Permissions,
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IROLE_REPOSITORY) private readonly roleRepository: IRoleRepository,
    @Inject(_const.IROLECLAIM_REPOSITORY) private readonly roleClaimRepository: IRoleClaimRepository,
  ) { }

  public async initializeAsync(): Promise<void> {
    await this.addAdministratorUserAndRoleAsync();

    if (configs.env !== 'production') {
      await this.addGuestUserAsync();
    }
  }

  private async addAdministratorUserAndRoleAsync(): Promise<void> {

    await this.addAdministratorRoleAsync();

    const SYSTEM_ADMIN = new User({
      firstName: configs.systemAdmin.firstName,
      lastName: configs.systemAdmin.lastName,
      email: configs.systemAdmin.email,
      emailConfirmed: true,
      type: UserType.Admin,
      createdBy: configs.systemAdmin.email,
      userName: "",
    });

    if (!(await this.userRepository.getUserByEmailAsync(SYSTEM_ADMIN.email))) {

      try {
        // Generate initials from the system admin's name
        // and create a base64 image for the avatar
        const initials = stringUtil.extractInitialsFromName(`${SYSTEM_ADMIN.firstName} ${SYSTEM_ADMIN.lastName}`);
        const base64Image = generateInitialImage(initials);
        // Upload the base64 image to Cloudinary and set the profile image URL
        // Note: Ensure that the uploadBase64ToCloudinaryAsync function is defined in your
        const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
        SYSTEM_ADMIN.profileImage = avatar.secure_url;
      } catch (error) {
        logger.error(`Failed to upload avatar for user ${SYSTEM_ADMIN.email}: ${error.message}`);
      }

      await this.userRepository.createAsync(SYSTEM_ADMIN, configs.systemAdmin.password);

      await this.userRepository.addToRoleAsync(SYSTEM_ADMIN, Globals.Roles.Admin);
    }
  }

  private async addGuestUserAsync(): Promise<void> {

    const JOHN_DOE = new User({
      firstName: configs.guestUser.firstName,
      lastName: configs.guestUser.lastName,
      email: configs.guestUser.email,
      emailConfirmed: true,
      type: UserType.User,
      createdBy: configs.systemAdmin.email,
      userName: configs.guestUser.userName
    });

    if (!(await this.userRepository.getUserByEmailAsync(JOHN_DOE.email))) {
      try {
        const initials = stringUtil.extractInitialsFromName(`${JOHN_DOE.firstName} ${JOHN_DOE.lastName}`);
        const base64Image = generateInitialImage(initials);
        // Upload the base64 image to Cloudinary and set the profile image URL
        // Note: Ensure that the uploadBase64ToCloudinaryAsync function is defined in your
        const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");
        JOHN_DOE.profileImage = avatar.secure_url;
      } catch (error) {
        logger.error(`Failed to upload avatar for user ${JOHN_DOE.email}: ${error.message}`);
      }
      await this.userRepository.createAsync(JOHN_DOE, "@Abc@123");
    }
  }

  private async addAdministratorRoleAsync() {

    let adminRoleInDb = await this.roleRepository.getByNameAsync(Globals.Roles.Admin);

    if (!adminRoleInDb) {
      adminRoleInDb = await this.roleRepository.createAsync(new Role({
        name: Globals.Roles.Admin,
        type: RoleType.System,
        createdBy: configs.systemAdmin.email,
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