# Domain Layer

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

`src/domain` defines the business model and contracts used across the application.

## Purpose

Keep business concepts explicit and reusable while staying independent from framework-specific runtime wiring.

## Structure

- `baseEntity.ts`: shared entity audit fields and lifecycle hooks
- `entities/`: persistence domain models (identity, collection, notification, platform data)
- `contracts/`: API/domain models used by handlers and services
- `enums.ts`: domain enumerations
- `events/`: domain event payloads
- `mappers/`: mapping between entities and contract models
- `repositories/`: repository interfaces
- `services/`: service interfaces
- `types/`: shared domain type helpers

## Entity Conventions

- Entity files use `*.entity.ts`.
- Entities inherit common audit fields via `BaseEntity` where applicable.
- `entities/index.ts` is the canonical barrel used by modules.

## Interface-First Rule

Use cases and modules MUST depend on:
- repository interfaces from `domain/repositories`
- service interfaces from `domain/services`

Concrete implementations live in `src/infrastructure` and are bound via DI tokens.

## Mapper Rule

Mapping between persistence entities and API-facing contract models MUST stay in `domain/mappers` to avoid duplicated transformation logic.

## What Not To Put Here

- Nest module wiring
- HTTP controllers
- queue processor orchestration
- direct external SDK calls

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
