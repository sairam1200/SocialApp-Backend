# Core Layer

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

`src/core` contains cross-cutting runtime infrastructure used by multiple modules and features.

## Purpose

Keep global technical concerns centralized so feature slices stay focused on business use cases.

## Structure

- `config/`: queue and runtime configuration helpers (`bullmq.config.ts`)
- `exceptions/`: application-specific exception classes and global exception filter
- `middlewares/`: HTTP middlewares (request context, API redirect, queue dashboard auth, rate limit)
- `passport/`: auth and permission guards (JWT, account type, turnstile)
- `utils/`: shared helpers (constants, redis, jwt, logging, serialization, etc.)
- `globals.ts`: shared claim/role/email constants

## Key Runtime Behaviors

### Request Context (`HttpContextMiddleware`)

- Applies globally in `AppModule`.
- Resolves user from bearer token (if present).
- Stores request/user context via `AsyncLocalStorage`.
- Enables downstream services to access current user context.

### Authentication and Authorization

- Account guards (`UserAccoutGuard`, `AdminAccoutGuard`, etc.)
- Permission guard based on controller/method claims.
- Turnstile guard for captcha-protected endpoints.
- Guard behavior checks Redis-backed account state (security/concurrency stamps).

### Error Handling

- Global exception filter: `ErrorHandlersFilter`
- Domain/application exceptions are mapped consistently.

### Logging

- Winston logger with daily rotating files.
- Redaction for sensitive fields in production mode.
- Console + file outputs.

### Redis and Queue Connectivity

- Shared Redis utility (`redis.util.ts`)
- Shared BullMQ connection is reused across queues/processors.

## What Should Live Here

- Request-scoped context and middleware behavior
- Security/auth guards and shared auth helpers
- Shared constants and runtime utility functions
- Generic technical helpers reused by multiple features

## What Should Not Live Here

- Feature-specific business rules
- ORM entity persistence logic
- Platform-specific API workflows

## Change Checklist

When updating `core`:
1. Verify no business rules are introduced.
2. Confirm changes remain reusable across features.
3. Validate impact on all modules (middlewares/guards are global or wide-scope).
4. Re-check auth/exception/logging behavior for regressions.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
