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
- `unified-search.endpoint.ts` — `GET /search/unified`
- `index.ts` for module composition exports

## Unified search

`GET /search/unified` is additive: `GET /search/results` is untouched and still
returns its separate arrays. The difference is that unified normalises every
source into one `SearchResultItem` first, which is the only reason an "All" tab
can exist — five differently-shaped arrays cannot be one list.

Six sources, all concurrent, all under `Promise.allSettled`: Community posts,
Gaddr profiles, live channels, Gaddr Jobs projects, Gaddr Jobs external
listings, and aggregated cross-platform content. Any one of them failing costs
that source's results and nothing else.

Rules worth knowing before changing it:

- **Ranking reuses the Community recommender.** Retrieval is per-source, fusion
  is Reciprocal Rank Fusion, and `for-you` adds the reader's topic affinities on
  top. A second, search-only ranker would mean two notions of "good" that
  disagree, and the reader would feel it as the feed and search recommending
  different things.
- **`isNative` is a product fact, not a hostname fact.** A job aggregated by
  Gaddr Jobs is ours *and* hosted on someone else's board. `externalUrl` is
  whatever the caller passes and is never inferred from `isNative`.
- **Facets are counted with their own filter lifted.** Counting all of them over
  the fully filtered list deletes every chip the reader has not already picked,
  and the filter becomes a one-way door.
- **`random` is deterministic per seed.** Naive shuffling reshuffles page 1 the
  moment page 2 loads.
- **Themes are derived, never declared.** Topics come off the results and are
  normalised (`" #Design "` → `"design"`) so one theme has one spelling across
  six sources with six conventions.

Gaddr Jobs is read over the shared database behind `IGaddrJobsRepository`, which
is the seam for a future HTTP split. Its tables are owned by the sister repo —
there are deliberately no migrations for them here.

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
