# Gaddr Backend API

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

Welcome to the backend of Gaddr — a NestJS project implementing a clean architectural folder structure based on Vertical Slice Architecture and CQRS (Command Query Responsibility Segregation).

## Branching Strategy

### `main`

- Production branch.
- 🚫 **DO NOT COMMIT, FETCH, OR PULL FROM THIS BRANCH.**
- ⚠️ Any direct activity on `main` is prohibited.

### `staging`

- Pre-production validation branch.
- Current staging endpoint: `https://gaddr-backend-api.onrender.com/`.

### `develop`

- Integration branch for all ongoing work.
- Always branch from `develop`.
- Open PRs from feature branches into `develop`.
- 🚫 Do not commit directly to `develop`.

### Feature Branches

- Branch naming convention: `feat/<short-description>`
- Example used for this work: `feat/readme-update`

## Tech Stack

- NestJS 11
- TypeORM (PostgreSQL)
- Redis + BullMQ
- Socket.IO (WebSocket gateways)
- Swagger + Scalar (non-production)

## Quick Start

### 1. Prerequisites

- Node.js 20+
- npm
- Docker

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Request the project `.env` from a senior developer.

Primary contact: `@kyree-henry`.

Do not create ad-hoc local variable sets unless explicitly requested by a senior.

### 4. Start local dependencies (required)

```bash
docker compose up -d
```

This starts:
- PostgreSQL on `localhost:5433`
- Redis on `localhost:6349`

### 5. Run the API

```bash
npm run dev
```

Base API shape:
- Global prefix: `/api`
- URI versioning enabled (v1 controllers are served under `/api/v1/...`)

## Migrations

Generate migration:

```bash
npm run migration:generate -- src/infrastructure/migrations/<name>
```

Run migrations:

```bash
npm run migration:run
```

Revert migration:

```bash
npm run migration:revert
```

Notes:
- `typeorm` script builds first and then runs TypeORM against `dist/infrastructure/persistence/data.source.js`.
- `migrationsRun` is also configurable via environment variables.

## Architecture Overview

This codebase follows clean boundaries with vertical slices and CQRS.

### Layer Purpose And Rules

- `src/core`
Contains cross-cutting runtime concerns (middlewares, guards, shared utilities, runtime constants).
Core MUST stay reusable and MUST NOT contain feature-specific business workflows.

- `src/domain`
Defines entities, contracts, enums, mappers, and repository/service interfaces.
Domain MUST stay framework-agnostic and MUST NOT contain transport or Nest module wiring.

- `src/features`
Implements vertical HTTP use-case slices (endpoint + handler + request/response models where needed).
Feature slices MUST isolate behavior per use case and avoid cross-feature coupling.

- `src/modules`
Composes Nest runtime wiring (imports, controllers, providers, CQRS handler registration).
Modules MUST orchestrate dependencies and MUST NOT implement business logic.

- `src/infrastructure`
Contains concrete implementations for persistence, external APIs, background workers, queues, and websocket gateways.
Infrastructure MUST implement contracts and MUST NOT define core business rules.

### Boundary Direction

`features -> domain interfaces -> infrastructure implementations`

`core` is shared across runtime layers for cross-cutting concerns.

`modules` assemble and wire dependencies.

Start from:
- `src/README.md`
- `src/features/README.md`
- `src/modules/README.md`
- `src/infrastructure/README.md`

## Runtime Components

- HTTP API with CQRS handlers
- Redis-backed caching and session/state helpers
- BullMQ processors for platform imports
- Socket.IO gateways:
  - `/imports`
  - `/notifications`

## Development Workflow

1. Pull latest `develop`.
2. Create feature branch.
3. Implement changes.
4. Validate the changed runtime paths locally.
5. Open PR into `develop`.

## Architecture PR Checklist

Every PR must include the architecture checklist from `.github/pull_request_template.md`.

Rules:
- All checklist items must be answered.
- If any item is unchecked, add explicit justification in PR notes.
- If a rule is intentionally violated, add a follow-up task reference and cleanup owner.

## Repository Conventions

- Keep business logic out of `infrastructure`.
- Keep transport-specific logic out of `domain`.
- Keep each endpoint use case isolated in `src/features/<feature>/<use-case>`.
- Register new providers through `src/infrastructure/dependency.ts` and consuming modules.

## Naming Conventions

- Branch names MUST use `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`, etc.
- Feature/use-case folders MUST be lowercase and hyphenated (example: `create-user`, `get-profile`).
- Endpoint files MUST use `.endpoint.ts`.
- Handler files MUST use `.handler.ts`.
- Class/type names MUST use `PascalCase`.
- Variable/function names MUST use `camelCase`.
- DTO/contract models SHOULD use a `*Model` suffix.
- Interfaces SHOULD use explicit domain naming (`IUserRepository`, `ITokenService`, etc.).

## Related README Files

- `src/README.md`
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
