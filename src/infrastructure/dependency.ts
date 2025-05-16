import _const from "../core/utils/const";
import { LinkedAccountRepository } from "./repositories/linkedAccount.repository";
import { RoleRepository } from "./repositories/role.repository";
import { RoleClaimRepository } from "./repositories/roleClaim.repository";
import { UserRepository } from "./repositories/user.repository";
import { UserLoginRepository } from "./repositories/userLogin.repository";
import { UserRoleRepository } from "./repositories/userRole.repository";
import { TokenService } from "./services/token.service";

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
  TokenService: {
    provide: _const.ITOKEN_SERVICE,
    useClass: TokenService,
  },
};