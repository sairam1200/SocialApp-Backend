# WebSocket Infrastructure

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Provides real-time delivery channels for imports and notifications.

## Structure

- `gateways/base.gateway.ts`: shared auth/emit utilities
- `gateways/import.gateway.ts`: namespace `/imports`
- `gateways/notification.gateway.ts`: namespace `/notifications`

## Auth Model

- Client sends JWT via `handshake.auth.token`.
- Gateway validates token via `JwtService` and joins user-specific room.

## Event Highlights

- Import gateway emits `new-content` updates.
- Notification gateway emits:
  - `new-notification`
  - `notification-updated`
  - `notification-read`
- Notification gateway also handles `mark-as-read` and `mark-all-as-read` commands.

## Notes

All gateway emits are user-room scoped for isolation.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
