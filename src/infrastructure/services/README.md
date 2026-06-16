# Infrastructure Services

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Concrete service implementations for domain service contracts and runtime orchestration helpers.

## Main Services

- `token.service.ts`: JWT generation/claims handling
- `email.service.ts`: email dispatch abstraction (event-driven)
- `notification.service.ts`: notification persistence + gateway emit
- `queue.service.ts`: enqueue/cancel import jobs per platform
- `search.service.ts`: platform search orchestration + persistence/cache blend
- `searchCache.service.ts`: Redis-based query cache/lock coordination
- `platform-disconnect.service.ts`: disconnect flow + content backup to stream
- `data.seeder.ts`: bootstrap seed for roles/admin/guest
- `webhooks/youtube-webhook.service.ts`: YouTube webhook subscribe/unsubscribe

## Dependencies

Registered through `src/infrastructure/dependency.ts` and consumed by modules.

## Notes

Keep platform SDK/API specifics here, not in controllers or domain interfaces.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
