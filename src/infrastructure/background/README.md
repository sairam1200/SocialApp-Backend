# Background Processing

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Asynchronous and scheduled workflows outside synchronous HTTP request handling.

## Structure

- `cron/jobs/`
  - `email-cleanup.cron.ts` (daily cleanup at 2 AM)
- `listeners/`
  - `email.listener.ts` (email event delivery)
  - `platform-rollback.listener.ts` (import rollback/cleanup)
- `processors/`
  - BullMQ import processors per platform

## Queue Integration

Processors consume jobs from queues registered in `src/modules/queues.module.ts`.

## Notes

Some processors are intentionally partial/placeholders (for example Threads). Validate platform capability before changing handler behavior.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
