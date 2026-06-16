# Persistence Configuration

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Defines TypeORM `DataSource` and PostgreSQL connection options.

## Key File

- `data.source.ts`

## Behavior

- Reads config from `src/configs.ts`.
- Resolves entities and migrations paths from environment values.
- Supports optional SSL configuration.
- Exported options are used in:
  - `TypeOrmModule.forRoot(postgresOptions)`
  - TypeORM CLI migration commands

## Notes

Keep this layer configuration-only; do not place repository/business logic here.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
