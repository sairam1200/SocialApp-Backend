# Integrations Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

This feature area MUST handle social-platform account connection, profile/content import, search, sync, disconnect, and webhook handling.

## Scope

Supported platform directories:

- `facebook`
- `instagram`
- `twitter`
- `tiktok`
- `linkedin`
- `youtube`
- `spotify`
- `pinterest`
- `reddit`
- `snapchat`
- `threads`
- `behance`

Platform slices SHOULD implement these operations when capability exists:
- `connect`
- `get-profile`
- `get-contents`
- `import`
- `search`
- `sync`
- `disconnect`
- `webhook` (YouTube)

## Structure

- Root composition MUST be `src/features/integrations/index.ts`.
- Route base pattern MUST be `/api/v1/integrations/<platform>/...`.

## Dependencies

Wiring MUST be done by `src/modules/integrations.module.ts` with queue services, notification services, repositories, and websocket integration.

## Notes

When integration capability is partial (for example Threads or selected Snapchat/Behance flows), handlers and routes MUST stay aligned with available processor/service capability.
Do not expose or advertise unsupported behavior without an explicit temporary deviation entry.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
