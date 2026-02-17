# Search Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Exposes global search endpoint orchestration over integration search services.

## Scope

- Request model normalization
- Dispatch to search service and return aggregated result model

## Structure

- `search.endpoint.ts`
- `search.handler.ts`
- `index.ts` for module composition exports

## Dependencies

Wired in `src/modules/integrations.module.ts`.

## Notes

Search behavior depends heavily on `src/infrastructure/services/search.service.ts` and cache helpers.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
