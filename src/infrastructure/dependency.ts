import _const from "../core/utils/const";
import { ContentStreamRepository, DataProtectionKeyRepository, LinkedAccountRepository, NotificationRepository, PlaylistRepository, RateLimitRepository, RoleClaimRepository, RoleRepository, UserContentRepository, UserLoginRepository, UserRepository, UserRoleRepository } from "./repositories";
import { ManualProfileRepository } from "./repositories/manualProfile.repository";
import { EmailService, NotificationService, SearchService, TokenService } from "./services";

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
  ManualProfileRepository: {
    provide: _const.IMANUALPROFILE_REPOSITORY,
    useClass: ManualProfileRepository
  },

  ContentStreamRepository: {
    provide: _const.ICONTENTSTREAM_REPOSITORY,
    useClass: ContentStreamRepository
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
  },
  SearchService: {
    provide: _const.ISEARCH_SERVICE,
    useClass: SearchService,
  }
};