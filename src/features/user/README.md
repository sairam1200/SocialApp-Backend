# User Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Implements user account management, identity updates, settings, and social follow workflows.

## Scope

- User CRUD-style operations (create/get/list/activate/deactivate)
- Username/email/phone updates and verification
- Password change
- Profile/account preferences and notification settings
- Follow graph actions (`follow`, `unfollow`, approvals, follower/following queries)

## Structure

- Root composition: `src/features/user/index.ts`
- Major areas:
  - `create-user`, `get-user`, `get-users`
  - `activate-*`, `deactivate-*`
  - `username/*`, `email/*`, `phone-number/*`
  - `update/*`
  - `settings/*`
  - `following/*`

## Dependencies

Main wiring in `src/modules/user.module.ts`; follow sub-slices are wired by `src/modules/follow.module.ts` via `src/features/user/following/index.ts`.

## Notes

Routes are versioned (`/api/v1/user...`). Guard usage varies by endpoint sensitivity.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
