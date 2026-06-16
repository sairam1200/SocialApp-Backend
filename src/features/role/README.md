# Role Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Manages role lifecycle and permission assignment.

## Scope

- Create/get/update/delete roles
- Activate/deactivate role
- Read and update permissions

## Structure

- Slices exist under:
  - `create-role`
  - `get-role`
  - `get-roles`
  - `update-role`
  - `delete-role`
  - `activate-role`
  - `deactivate-role`
  - `get-permissions`
  - `update-permissions`

## Dependencies

Wired explicitly in `src/modules/role.module.ts`.

## Notes

`src/features/role/index.ts` is currently empty; role wiring is done with explicit imports in the module.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
