import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import {
  Role,
  RoleClaim,
  User,
  UserBiometric,
  UserClaim,
  UserRole,
} from '../domain/entities';

/**
 * Makes the identity repository resolvable from anywhere.
 *
 * ## Why this is `@Global()`
 *
 * The account guards (`UserAccoutGuard`, `AuthenticatedAccountGuard`, …) now read the
 * database when the session cache misses, so session revocation fails closed instead of
 * being skipped (finding C5). That gave them a constructor dependency on
 * `IIDENTITY_REPOSITORY`.
 *
 * Nest resolves a guard's dependencies in the context of the module where the guard is
 * *used*, not where it is declared. These guards are applied across ~147 endpoints in
 * more than a dozen feature modules, so the alternative is registering the identity
 * repository — and its whole transitive graph — in every one of them. That is a lot of
 * duplication for one cross-cutting concern, and it silently breaks the next module
 * someone adds a guard to.
 *
 * A single global provider is the honest shape for something every guarded request needs.
 *
 * ## How this was found
 *
 * Not by the build, and not by the tests. `tsc` cannot see a DI graph, and the guard unit
 * tests inject a stub repository directly. The failure only appears when the application
 * actually boots:
 *
 *   Nest can't resolve dependencies of the AccessLevelGuard (JwtService, ?).
 *   Please make sure that the argument "IIdentityRepository" at index [1] is available…
 *
 * Which is the same lesson as the other defects in this codebase: a green gate is not
 * evidence that the wiring works. Start the process.
 */
@Global()
@Module({
  imports: [
    // IdentityRepository's transitive graph. Mirrors RoleModule, which already wires it.
    TypeOrmModule.forFeature([
      User,
      Role,
      UserBiometric,
      UserClaim,
      RoleClaim,
      UserRole,
    ]),
  ],
  providers: [
    dependency.IdentityRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.RoleClaimRepository,
  ],
  exports: [
    dependency.IdentityRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.RoleClaimRepository,
  ],
})
export class IdentityAccessModule {}
