# Gaddr Backend API

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

Gaddr backend service built with NestJS, CQRS, and a vertical-slice feature structure.

## Branching Strategy

### `main`

- Production branch.
- Do not commit, fetch, or pull directly on this branch.

### `staging`

- Pre-production validation branch.
- Current staging endpoint: `https://gaddr-backend-api.onrender.com/`

### `develop`

- Integration branch for all ongoing work.
- Always branch from `develop`.
- Open PRs from feature branches into `develop`.
- Do not commit directly to `develop`.

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
- PostgreSQL
- Redis

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

`src/configs.ts` loads environment in this order:
1. `.env.<NODE_ENV>`
2. `.env` (with override enabled)

Minimum variables required for local development:

- `NODE_ENV`
- `PORT`
- `PROJECT_NAME`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USERNAME`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `POSTGRES_ENTITIES`
- `POSTGRES_MIGRATIONS`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `JWT_AUDIENCE`
- `JWT_ISSUER`

### 4. Start local dependencies (optional, via Docker)

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

This codebase follows clean-layer boundaries with feature slices:

- `src/core`: cross-cutting runtime concerns (middlewares, guards, shared utilities)
- `src/domain`: entities, contracts, repository/service interfaces, mappers
- `src/features`: HTTP vertical slices (endpoint + handler per use case)
- `src/modules`: Nest module composition and DI wiring
- `src/infrastructure`: concrete implementations (repositories, services, queues, websockets, migrations)

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
4. Validate locally (`npm run lint`, relevant run commands).
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
