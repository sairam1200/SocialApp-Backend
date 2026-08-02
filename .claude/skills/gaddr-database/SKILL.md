---
name: gaddr-database
description: Database work in the Gaddr backend — migrations, schema changes, TypeORM entities, indexes, query performance, and provisioning a new environment. Use when adding or altering a table, writing a migration, debugging a failed migration, or when a query is slow.
when_to_use: Trigger phrases include "add a table", "add a column", "new migration", "migration failed", "QueryFailedError", "Entity metadata was not found", "synchronize", "set up a fresh database", "provision staging", "this query is slow", "add an index", "N+1", "ILIKE", "pg_trgm", "TypeORM", "Neon", "seed data", and any edit under src/infrastructure/migrations/ or src/domain/entities/.
---

# Gaddr database

PostgreSQL (Neon in production) via TypeORM 0.3. Schemas: `public`, `identity`,
`analytics`, `notification`.

## Read this before writing a migration

The migration chain was **unable to build a database from empty** until 2026-07-25.
Six tables had entities — one even had an `ALTER` migration — but no migration ever
created them, because `synchronize: true` or hand-applied DDL had created them in
production instead. Provisioning staging, a new region, a local database, or a
disaster-recovery rebuild all failed. Full account in
`docs/integrations/END_TO_END_VERIFICATION.md`.

The lesson generalises: **production working is not evidence that the migration chain
works.** Production was grown incrementally; a new environment replays from zero.

### Non-negotiable rules

1. **Never rely on `synchronize: true`.** It is a convenience for local scratch
   databases only. If it creates a table, that table is invisible to every other
   environment. Every schema change ships as a migration.
2. **Never edit an applied migration.** TypeORM records executed migrations by name,
   so an edit never re-runs — the change silently applies nowhere.
   `normalizeRemainingFkColumnsToUuid1784000000008` exists purely to repair this
   ("migration ...007 was already applied when edited in-place"). Write a new
   migration instead.
3. **Never depend on production-only state.** `gaddr_users_compat` is a leftover of an
   earlier auth migration that nothing creates. A migration joining it fails
   everywhere else. Guard such steps on existence:
   ```ts
   const exists = await queryRunner.query(
     `SELECT 1 FROM information_schema.tables WHERE table_name = 'x' LIMIT 1`,
   );
   if (exists?.length) { /* data remediation */ }
   ```
   Data remediation is a no-op on a fresh database by definition; schema changes are not
   — keep those unconditional.
4. **Make migrations idempotent** where they might race an existing state:
   `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`.
5. **`down()` must not destroy data it did not create.** `CreateMissingTables`'s
   `down()` is deliberately empty — those tables hold production rows. An
   irreversible migration beats a reversal that deletes user data.
6. **Preserve generated constraint and index names** when back-filling a migration for
   an existing table, or you create differently-named duplicates that diverge from
   production. Generate the DDL rather than writing it: run `synchronize: true` against
   an empty database, `pg_dump --schema-only -t <table>`, and copy the result.

### Verify a migration actually works

Reading it is not enough — this is exactly how the chain broke.

```bash
createdb gaddr_migrate_test
# point .env.development at it: POSTGRES_MIGRATIONS_RUN=true, SYNCHRONIZE=false
npm run build && node dist/main.js
psql -d gaddr_migrate_test -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public','identity','analytics','notification')"
psql -d gaddr_migrate_test -c "SELECT count(*) FROM migrations"
dropdb gaddr_migrate_test
```

Expect **42 tables and 52 migrations** (as of 2026-07-25) and zero
`QueryFailedError`. If the count changed, update it here.

## Entities

Live in `src/domain/entities/`, including the subdirectories `identity/`,
`notification/`, `collection/`. **The glob must be recursive** —
`domain/entities/**/*.entity.js`. A non-recursive glob loads 25 of 39 entities and
fails with a misleading error:

```
TypeORMError: Entity metadata for UserFollow#follower was not found
```

Most entities extend `BaseEntity` (`domain/baseEntity.ts`), which supplies
`id`, `createdBy/On`, `lastModifiedBy/On`, `lastRefreshed`.

## Connection and TLS

`data.source.ts` prefers `DATABASE_URL`, falling back to the discrete `POSTGRES_*`
variables. Both paths are live — until recently only the URL was read, so the
discrete variables were validated at boot and then discarded.

TLS is on by default and disabled only for a plainly local target or an explicit
`POSTGRES_SSL=false`. `POSTGRES_SSL_REJECTUNAUTHORIZED` defaults to `false`, which
accepts any certificate and therefore does **not** protect against an active MITM —
set it `true` in production (audit finding M7).

## Query performance

Constraints that change design decisions: **512 MB RAM**, 0.1 vCPU. Nothing unbounded
in memory — stream, never buffer a whole table.

- **Every new query needs an index**, and the index ships in the same migration.
- **Watch for N+1**, especially `Promise.all` over a `.map` that queries per item.
  `database-search.handler.ts` resolves profile images per result this way; it is
  bounded by page size, but the pattern is easy to get wrong.
- **`ILIKE '%term%'` cannot use a btree index.** For substring search use `pg_trgm`
  with a GIN index; for word search use `tsvector` + GIN.
- **Do not scan JSON columns.** `contentStreams` search expanded every row's
  `metaData` with `json_each_text` — a full table scan with per-row JSON parsing.
  Extract the searchable fields into real columns at write time instead.
- 387 raw `.query()` call sites exist and are **all parameterised**. Keep it that way:
  never interpolate into a query string.

## Uniqueness belongs in the database

Application-level dedup is not a constraint. `contentStreams` deduped by
`externalId` in code with no unique index, so concurrent inserts of the same item
from different queries could race past it. If an invariant matters, express it as a
`UNIQUE` index — then the race becomes a caught conflict instead of a duplicate row.

## Never commit data

A production dump containing bcrypt password hashes and TOTP 2FA secrets was
committed to this repository (see `docs/audit/`). `.gitignore` blocks `*.dump`,
`*.sql` and friends, and `.gitleaks.toml` adds a `gaddr-postgres-dump` rule that
matches the pg_dump custom-format file signature **by content**, so renaming a dump
to evade a path-based ignore does not work.

(That rule is deliberately not quoted here — writing the signature into this file
makes the file itself a match. It caught exactly that while this skill was being
written, which is a reasonable demonstration that it works.)

Use a scratch database and a small seed script for local work. If you need
production-shaped data, generate it.


## User input in a LIKE pattern must be escaped

Parameterisation stops injection. It does **not** stop a bound value being interpreted as a
pattern — `%` and `_` keep their wildcard meaning inside `LIKE`/`ILIKE`.

Measured on the live aggregated-search endpoint against 72 rows:

```
keyword=%              -> 50 results (the page limit) — the whole table
keyword=zzzzzznomatch  ->  0 results
```

Two problems, and the second is the serious one: unrelated rows presented as search results,
and `searchText ILIKE '%%%'` cannot use the trigram index, so it becomes a sequential scan
over the fastest-growing table in the schema — triggerable by any anonymous caller typing one
character on a 512 MB instance.

Use the helper, never a hand-built template:

```ts
import { containsPattern, escapeLikePattern } from '../../core/utils/likePattern.util';

parameters.searchQuery = containsPattern(searchQuery);        // %escaped%
setParameters({ prefix: `${escapeLikePattern(keyword)}%` });  // escaped%
```

Twelve sites built the pattern by hand and only two escaped, which is the expected outcome
for a rule that must be remembered at every call site. `likePattern.util.spec.ts` scans the
repositories and fails when a thirteenth appears.

Do **not** escape quotes or semicolons here — they are already safe as bound parameters, and
mangling them breaks legitimate searches like `O'Brien`.

