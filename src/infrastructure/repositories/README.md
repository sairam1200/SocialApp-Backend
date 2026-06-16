# Infrastructure Repositories

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Implements domain repository interfaces using TypeORM-backed persistence.

## Scope

Repository implementations for:
- user/role/auth data
- linked accounts and user content
- notifications and preferences
- playlists and follows
- topics/search history/content stream
- rate limit tracking

## Structure

- One repository class per interface contract.
- Shared exports in `index.ts`.

## Dependencies

Wired through `src/infrastructure/dependency.ts` tokens and injected into handlers/services/modules.

## Notes

Keep query and persistence logic here; avoid embedding business rules.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
