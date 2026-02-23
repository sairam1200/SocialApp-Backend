# Notification Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

This feature area defines policy for notification-specific HTTP endpoints.

## Scope

- Notification HTTP event endpoints MUST live under `src/features/notification/event/*`.
- Event creation/update capabilities MUST be implemented as vertical slices (`*.endpoint.ts` + `*.handler.ts`) before export.

## Structure

- Composition root MUST be `src/features/notification/index.ts`.

## Dependencies

Notification runtime behavior MUST be wired through:
- `src/infrastructure/services/notification.service.ts`
- `src/infrastructure/websocket/gateways/notification.gateway.ts`
- `src/modules/notification.module.ts`

## Notes

Notification HTTP endpoints are active only after explicit exports are added in `src/features/notification/index.ts` and consumed by `src/modules/notification.module.ts`.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
