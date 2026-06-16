# Modules Layer

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

`src/modules` contains Nest module composition and dependency wiring.

## Purpose

- Define module boundaries.
- Import required entities and infrastructure providers.
- Attach feature controllers/handlers to module context.

## Module Map

- `app.module.ts`
  - Root module.
  - Configures global imports (JWT, TypeORM, schedule, event emitter).
  - Applies `HttpContextMiddleware` globally.
  - Triggers `DataSeeder.initializeAsync()` on bootstrap.

- `auth.module.ts`
  - Authentication flows from `features/auth`.

- `user.module.ts`
  - User + onboarding features.

- `role.module.ts`
  - Role/permission endpoints and handlers (wired explicitly).

- `profile.module.ts`
  - Profile and manual profile operations.

- `playlist.module.ts`
  - Playlist and bookmark flows.

- `integrations.module.ts`
  - Social platform integrations + global search.
  - Includes import rollback listener and cache service.

- `notification.module.ts`
  - Notification wiring + notification WebSocket gateway.

- `queues.module.ts`
  - BullMQ setup, queue registration, processors, queue service.
  - Adds Bull Board middleware route at `/background/queues`.

- `follow.module.ts`
  - Follow/follower workflows from `features/user/following`.

- `email.module.ts`
  - Email service and async event listener wiring.

- `authGuard.module.ts`
  - Shared auth guards module exports.

## Wiring Conventions

- Repository and service implementations come from `src/infrastructure/dependency.ts`.
- `TypeOrmModule.forFeature([...])` registers entities per module context.
- CQRS handlers/controllers are usually spread from feature index exports.

## Rules

- Keep business logic out of modules.
- Modules MUST orchestrate dependencies and MUST NOT implement use cases.
- New providers MUST use domain interface tokens unless an explicit exception is documented.

## Change Checklist

1. Add/update entities in `TypeOrmModule.forFeature` only when needed.
2. Register handlers/controllers from feature index or explicit imports.
3. Ensure required provider tokens are available from `dependency`.
4. Verify no circular imports are introduced.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
