# Auth Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Implements authentication and session-related use cases.

## Scope

- Access token issuance
- Registration
- Refresh token flow
- Forgot/reset password
- Email/code verification
- 2FA setup/enable/verify/disable
- External auth callbacks (Google, Facebook)
- Logout

## Structure

- Root composition: `src/features/auth/index.ts`
- Sub-slices:
  - `login`
  - `register`
  - `refresh-token`
  - `forgot-password`
  - `reset-password`
  - `verify-code`
  - `logout`
  - `2fa/*`
  - `external/*`

## Dependencies

Wired in `src/modules/auth.module.ts` with domain interfaces resolved via `dependency` providers.

## Notes

Controllers use `path: '/auth'` + `version: '1'`, exposed under `/api/v1/auth/...`.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
