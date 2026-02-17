# Database Migrations

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Tracks schema evolution over time using TypeORM migration classes.

## Commands

Generate:

```bash
npm run migration:generate -- src/infrastructure/migrations/<migration-name>
```

Run:

```bash
npm run migration:run
```

Revert:

```bash
npm run migration:revert
```

## Conventions

- Keep migration files immutable once shared.
- Use descriptive suffixes in file names.
- Verify generated SQL before merging.

## Notes

`npm run typeorm` builds project first and points TypeORM CLI at `dist/infrastructure/persistence/data.source.js`.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
