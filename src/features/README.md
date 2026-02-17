# Features Layer

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

`src/features` is the vertical-slice HTTP layer.

## Purpose

Each use case MUST be implemented as a slice with:
- endpoint/controller (`*.endpoint.ts`)
- command/query handler (`*.handler.ts`)
- request/response models where needed

This MUST keep feature behavior isolated and reduce cross-feature coupling.

## Current Feature Areas

- `auth`
- `user`
- `profile`
- `role`
- `playlist`
- `onboarding`
- `integrations`
- `search`
- `notification`

## Slice Conventions

- Directory names MUST be lowercase with hyphens.
- Controller files MUST use `.endpoint.ts`.
- Handler files MUST use `.handler.ts`.
- Controllers MUST declare `version: '1'` unless explicitly exempted by module-level decision.
- Route base pattern MUST follow `main.ts`: `/api/v1/...`.

## Composition Pattern

Feature roots MUST expose:
- `addControllers()`
- `addHandlers()`

Modules MUST consume these arrays to wire CQRS and routes.

Examples:
- `src/features/auth/index.ts`
- `src/features/user/index.ts`
- `src/features/integrations/index.ts`

Special case:
- `role` is explicitly wired in `src/modules/role.module.ts` while `src/features/role/index.ts` remains empty.
- Until `src/features/role/index.ts` exports are added, `role.module.ts` MUST wire role controllers/handlers directly.

## Guard and Security Usage

Feature endpoints MUST apply guards at controller/method level based on route sensitivity:
- account guards (`UserAccoutGuard`, `AdminAccoutGuard`, etc.)
- permission guard where claim-level authorization is required
- turnstile validation where abuse-risk or public-surface policy requires it

## Related Sub-READMEs

- `src/features/auth/README.md`
- `src/features/user/README.md`
- `src/features/integrations/README.md`
- `src/features/onboarding/README.md`
- `src/features/profile/README.md`
- `src/features/playlist/README.md`
- `src/features/role/README.md`
- `src/features/search/README.md`
- `src/features/notification/README.md`

## Adding a New Slice

1. Create folder under the correct feature area.
2. Add endpoint + handler.
3. Reuse domain contracts/mappers where possible.
4. Export from feature `index.ts` (or wire directly in module if needed).
5. Register dependencies in module providers via `dependency` object tokens unless an explicit exception is documented.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
