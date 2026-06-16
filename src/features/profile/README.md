# Profile Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Provides profile retrieval and manual profile management operations.

## Scope

- Get profile
- Get linked platform accounts
- Manual profile CRUD/search/reorder

## Structure

- Composition: `src/features/profile/index.ts`
- Slices:
  - `get`
  - `get-linked-accounts`
  - `manual/*`

## Dependencies

Wired in `src/modules/profile.module.ts`.

## Notes

Manual profile operations are grouped under `manual` and follow the same endpoint/handler slice convention.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
