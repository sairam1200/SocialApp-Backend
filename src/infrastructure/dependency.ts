import _const from "../core/utils/const";
import { TokenService } from "./services/token.service";
import { EmailService } from "./services/email.service";
import { UserRepository } from "./repositories/user.repository";
import { RoleRepository } from "./repositories/role.repository";
import { NotificationService } from "./services/notification.service";
import { UserRoleRepository } from "./repositories/userRole.repository";
import { RateLimitRepository } from "./repositories/rateLimit.repository";
import { RoleClaimRepository } from "./repositories/roleClaim.repository";
import { UserLoginRepository } from "./repositories/userLogin.repository";
import { UserContentRepository } from "./repositories/userContent.repository";
import { NotificationRepository } from "./repositories/notification.repository";
import { LinkedAccountRepository } from "./repositories/linkedAccount.repository";
import { PlaylistRepository } from "./repositories/playlist.repository";
import { DataProtectionKeyRepository } from "./repositories/dataProtectionKey.repository";

/* This is the dependency object that holds all the repositories & services
* used in the application. It is used to provide the dependencies to the
* modules in the application. This is a good practice to keep the
* dependencies in one place and make it easy to manage them.
*/
export const dependency = {
  UserRepository: {
    provide: _const.IUSER_REPOSITORY,
    useClass: UserRepository,
  },
  UserRoleRepository: {
    provide: _const.IUSERROLE_REPOSITORY,
    useClass: UserRoleRepository,
  },
  RoleRepository: {
    provide: _const.IROLE_REPOSITORY,
    useClass: RoleRepository,
  },
  UserLoginRepository: {
    provide: _const.IUSERLOGIN_REPOSITORY,
    useClass: UserLoginRepository,
  },
  RoleClaimRepository: {
    provide: _const.IROLECLAIM_REPOSITORY,
    useClass: RoleClaimRepository,
  },
  LinkedAccountRepository: {
    provide: _const.ILINKEDACCOUNT_REPOSITORY,
    useClass: LinkedAccountRepository,
  },
  DataProtectionKeyRepository: {
    provide: _const.IDATAPROTECTIONKEY_REPOSITORY,
    useClass: DataProtectionKeyRepository,
  },
  NotificationRepository: {
    provide: _const.INOTIFICATION_REPOSITORY,
    useClass: NotificationRepository
  },
  UserContentRepository: {
    provide: _const.IUSERCONTENT_REPOSITORY,
    useClass: UserContentRepository
  },
  RateLimitRepository: {
    provide: _const.IRATELIMIT_REPOSITORY,
    useClass: RateLimitRepository
  },
  PlaylistRepository: {
    provide: _const.IPLAYLIST_REPOSITORY,
    useClass: PlaylistRepository
  },
  TokenService: {
    provide: _const.ITOKEN_SERVICE,
    useClass: TokenService,
  },
  EmailService: {
    provide: _const.IEMAIL_SERVICE,
    useClass: EmailService,
  },
  NotificationService: {
    provide: _const.INOTIFICATION_SERVICE,
    useClass: NotificationService,
  }
};