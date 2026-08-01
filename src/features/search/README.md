# Search Feature

> Policy Note: This document defines target architecture rules and boundaries. Implementation may lag.

## Purpose

Exposes the consolidated global search endpoint (`POST /search`) orchestrated over integration search providers, plus the typeahead suggestions endpoint (`GET /search/suggestions`).

## Scope

- Request model normalization
- Dispatch to search providers and aggregate/deduplicate/rank results
- Resolve creator identity on every result (`userId`, display name, handle, verified, profile image, profile URL)

## Structure

- `search.endpoint.ts` — HTTP routes (`POST /search`, `GET /search/suggestions`)
- `search.handler.ts` — request/response models (`GlobalSearchRequestModel`, `GlobalSearchResponseModel`)
- `database-search.handler.ts` — `SearchSuggestionsQueryHandler`
- `searchOrchestrator.service.ts` — consolidated pipeline: concurrent providers, direct `userContents` search, re-run unified after legacy persistence, merge + paginate + cache
- `mergePipeline.ts` + `deduplication.strategy.ts` — merge/dedup/ranking
- `providers/` — `unifiedSearch`, `legacySearch`, `profileSearch`, `projectSearch`, `jobSearch`
- `adapters/` — document → `SearchResult` mapping (creator identity applied here)
- `index.ts` — module composition exports

## Dependencies

Wired in `src/modules/integrations.module.ts` (`SEARCH_PROVIDERS`), with `CreatorIdentityResolver` provided in `src/modules/queues.module.ts`. Search behavior depends heavily on `src/infrastructure/services/search.service.ts`, `src/infrastructure/search/postgresSearchProvider.ts`, `searchCache.service.ts` and the `IUserContentRepository`.

## Notes

Dead search endpoints (`GET /search/results`, `GET /search/item`) were removed (2026-07-31). Search is a single API: `POST /search` + `GET /search/suggestions`. See `docs/searchunified/15_Search_API_Refactor.md` for history.

## Temporary Deviations

If implementation intentionally deviates from this policy, record it here before merge.

- Deviation:
- Reason:
- Cleanup owner:
- Target cleanup date:
- Tracking link:
