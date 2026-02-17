# Onboarding Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Tracks and updates step-based onboarding completion state.

## Scope

- Status endpoint
- Step 1 to Step 4 get/update flows
- Topics retrieval

## Structure

- Composition: `src/features/onboarding/index.ts`
- Slices:
  - `status`
  - `step1`
  - `step2`
  - `step3`
  - `step4`
  - `topics`

## Dependencies

Wired in `src/modules/user.module.ts`.

## Notes

All onboarding controllers are versioned and exposed under `/api/v1/onboarding/...`.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
