# Infrastructure Layer

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

`src/infrastructure` contains all concrete implementations for external systems and runtime adapters.

## Purpose

Bridge domain abstractions to real implementations:
- database persistence
- background processing
- external API calls
- websocket delivery

## Structure

- `dependency.ts`: central DI token-to-class mapping
- `persistence/`: TypeORM data source configuration
- `repositories/`: implementations of domain repository interfaces
- `services/`: implementations of domain services and runtime support services
- `background/`: cron jobs, event listeners, BullMQ processors
- `websocket/`: Socket.IO gateways
- `migrations/`: TypeORM migration history

## Dependency Registration

All core infrastructure providers are exposed via `dependency` object in `src/infrastructure/dependency.ts`.

Pattern:

- token from `src/core/utils/const.ts`
- concrete class from `repositories` or `services`
- consumed inside modules via `providers`

## Runtime Flows

### Import Pipeline (Platform Integrations)

1. Feature handler enqueues import through `QueueService`.
2. BullMQ processor pulls job from queue.
3. Processor fetches/normalizes platform data.
4. Data is persisted as `UserContent` (and moved/merged with `ContentStream` when needed).
5. Real-time updates are emitted via `ImportGateway`.
6. Notifications are updated through `NotificationService`.

### Notification Pipeline

1. Domain/use-case calls `NotificationService`.
2. Notification is persisted via repository.
3. Real-time event is emitted through `NotificationGateway`.

### Platform Rollback/Cleanup

Event listeners in `background/listeners` handle rollback/cleanup to protect consistency when imports fail or disconnect occurs.

## Operational Notes

- TypeORM data source is initialized in `main.ts`.
- Redis connection and shared BullMQ connections are initialized at startup.
- BullMQ queue names are defined in `_const.BULL_QUEUES`.

## Related Sub-READMEs

- `src/infrastructure/persistence/README.md`
- `src/infrastructure/repositories/README.md`
- `src/infrastructure/services/README.md`
- `src/infrastructure/background/README.md`
- `src/infrastructure/websocket/README.md`
- `src/infrastructure/migrations/README.md`

## Rules

- No core business rules in infrastructure classes.
- Implement domain contracts, do not bypass them.
- Keep external API specifics isolated to services/processors.
- Keep module wiring in `src/modules`, not here.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
