# Source Layout (`src`)

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

This folder contains the full application runtime code.

## Purpose

Provide a predictable structure where:
- `features` handle HTTP use cases,
- `domain` defines business models/contracts,
- `infrastructure` implements external dependencies,
- `modules` compose Nest runtime wiring,
- `core` provides cross-cutting runtime behaviors.

## Top-Level Structure

- `src/main.ts`: application bootstrap (global prefix/versioning, filters, docs registration, Redis connect)
- `src/configs.ts`: environment loading and Joi validation
- `src/core`: shared runtime utilities/guards/middlewares
- `src/domain`: entities, models, interfaces, mappers
- `src/features`: vertical slices per API capability
- `src/modules`: module composition and provider wiring
- `src/infrastructure`: concrete data/services/background/websocket implementations
- `src/types`: shared type helpers

## Dependency Direction

Follow this direction to avoid architectural drift:

`features -> domain interfaces -> infrastructure implementations`

`core` can be used by all runtime layers for cross-cutting concerns.

`modules` wire everything together and should not contain business rules.

## Request Lifecycle (Simplified)

1. Request enters controller in `src/features/.../*.endpoint.ts`.
2. Controller dispatches command/query via CQRS bus.
3. Handler executes use-case logic.
4. Handler depends on domain interfaces (repositories/services).
5. Nest DI resolves interfaces to concrete classes from `src/infrastructure/dependency.ts`.
6. Persistence/external APIs happen in `src/infrastructure`.

## API Shape

Configured in `src/main.ts`:
- Global prefix: `/api`
- URI versioning enabled
- Controllers generally use `version: '1'`

Resulting route pattern: `/api/v1/...`

## Where To Add New Code

- New API use case: `src/features/<feature>/<use-case>/`
- New DB/external implementation: `src/infrastructure/<area>/`
- New interface/model/entity: `src/domain/`
- New wiring/composition: `src/modules/`
- New cross-cutting helper/guard/middleware: `src/core/`

## Related Docs

- `src/core/README.md`
- `src/domain/README.md`
- `src/features/README.md`
- `src/modules/README.md`
- `src/infrastructure/README.md`

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
