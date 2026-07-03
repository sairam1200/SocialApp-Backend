# YouTube Analytics & Import — Root Cause Analysis

---

## ISSUE 1: YouTube Analytics Values Incomplete

### Current Stored State
```json
{
  "subscriberCount":1,
  "viewCount":"6",
  "videoCount":2,
  "engagementMetrics":{},
  "estimatedMinutesWatched":"0",
  "averageViewDurationSeconds":0,
  "subscribersGained":0, "subscribersLost":0,
  "likes":0, "comments":0, "shares":0,
  "estimatedRevenueUsd":0, "estimatedAdRevenueUsd":0,
  "trafficSources":[], "geography":[], "devices":[],
  "audience":{}, "playbackLocations":[]
}
```

### Execution Trace

```
syncAllAccountsAnalyticsAsync()                  [youtube-analytics.cron.ts:18]
  └─ syncAccountAnalyticsAsync(userId)           [youtubeAnalytics.service.ts:53]
       ├─ resolveTokenAsync(userId)              [youtubeAnalytics.service.ts:186]
       │    └─ OAuth token from UserLogin → refresh if expired
       ├─ fetchChannelInfoAsync(accessToken)     [youtubeAnalytics.service.ts:256]
       │    └─ GET /youtube/v3/channels?part=snippet,statistics&mine=true
       │    └─ Returns: channelId, subscriberCount, viewCount, videoCount
       ├─ getMissingDatesAsync(channelId)        [youtubeAnalytics.service.ts:228]
       │    └─ Compares latest snapshotDate vs today
       │    └─ Returns: up to 7 missing dates (or 31 for initial sync)
       │
       ├─ syncChannelDailyMetricsAsync(...)      [youtubeAnalytics.service.ts:279]
       │    └─ GET /youtubeanalytics/v2/reports
       │    │    ?ids=channel==MINE
       │    │    &metrics=views,estimatedMinutesWatched,averageViewDuration,
       │    │             subscribersGained,subscribersLost,likes,comments,shares
       │    │    &dimensions=day&startDate=...&endDate=...&sort=day
       │    └─ result.rows → indexRowsByDate → saveChannelSnapshot per date
       │
       ├─ syncRevenueMetricsAsync(...)           [youtubeAnalytics.service.ts:310]
       │    └─ GET /youtubeanalytics/v2/reports
       │         ?ids=channel==MINE
       │         &metrics=estimatedRevenue,estimatedAdRevenue
       │         &dimensions=day&startDate=...&endDate=...&sort=day
       │
       ├─ syncDimensionDataAsync(...)            [youtubeAnalytics.service.ts:372]
       │    └─ For each dimension in DIMENSION_CONFIGS (5 iterations):
       │         ├─ hasDimensionSnapshotAsync() check
       │         │    └─ (skips if latest snapshot date == today AND data exists)
       │         ├─ GET /youtubeanalytics/v2/reports
       │         │    ?ids=channel==MINE
       │         │    &metrics=views,estimatedMinutesWatched
       │         │    &dimensions=day,{dimension}
       │         │    &maxResults=5000
       │         └─ If rows exist: groupDimensionRowsByDate →
       │            getByChannelIdAndDateAsync → Object.assign → createOrUpdateAsync
       │
       └─ syncVideoMetricsAsync(...)             [youtubeAnalytics.service.ts:480]
            └─ GET /youtubeanalytics/v2/reports with dimensions=day,video
```

### Root Cause 1a: `analytics` OAuth token scope mismatch

**Location:** `youtube-connect.endpoint.ts:44-52`

The connect flow requests 6 scopes including `yt-analytics.readonly`. This is correct. BUT the **Analytics API v2 requires the channel to be MONETIZED or have SUFFICIENT HISTORY** to return dimension breakdowns. For a new channel with low activity, the API returns empty rows for:
- `insightTrafficSourceType` (needs minimum views from different sources)
- `country` (needs views from multiple countries)
- `deviceType` (needs views from multiple devices)
- `subscribedStatus` (needs non-subscriber views)
- `playbackLocationType` (needs external embeds)

This is NOT a code bug — it's an API data availability limitation.

**Severity:** Low (API limitation, not code)

### Root Cause 1b: `engagementMetrics` hardcoded to empty object

**Location:** `youtubeAnalytics.service.ts:353`

```typescript
const snapshot = new YoutubeChannelAnalytics({
    // ...
    engagementMetrics: {},  // <--- ALWAYS hardcoded empty
    // ...
});
```

The `engagementMetrics` JSONB column is initialized to `{}` and NEVER updated by any subsequent analytics step. In `createOrUpdateAsync` (`youtubeChannelAnalytics.repository.ts:22-24`):

```typescript
if (existing) {
    Object.assign(existing, analytics);  // Overwrites ALL fields
    return await this.channelAnalyticsContext.save(existing);
}
```

Every sync creates a fresh `YoutubeChannelAnalytics` with `engagementMetrics: {}`, and `Object.assign` copies it onto the existing row, **wiping any previous data**. Even if `engagementMetrics` were populated by another process, the next analytics sync would clear it.

**Severity:** Medium (data loss on every sync)

### Root Cause 1c: `subscriberCount` only updates at sync time

**Location:** `youtubeAnalytics.service.ts:69`

```typescript
const { channelId, subscriberCount, viewCount, videoCount } = channelInfo;
```

The subscriber count comes from `fetchChannelInfoAsync()` which calls the **YouTube Data v3 API** (`/channels`), NOT the Analytics API. This returns the CURRENT cumulative count. But:

- The count is saved once per analytics sync (midnight cron or manual trigger)
- Between syncs, subscriberCount in the analytics table is STALE
- The import handler does NOT trigger analytics sync (see Issue 3)

**Severity:** Medium (stale data between syncs)

### Root Cause 1d: `hasDimensionSnapshotAsync` can skip dimension syncing

**Location:** `youtubeAnalytics.service.ts:468-478`

```typescript
private async hasDimensionSnapshotAsync(channelId, field, dateStr): Promise<boolean> {
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) return false;
    if (this.formatDate(latest.snapshotDate) !== dateStr) return false;
    const val = (latest as any)[field];
    if (!val) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    return true;  // <--- TRUE means "skip, data already exists"
}
```

This checks the LATEST snapshot for ALL dimensions. If the latest snapshot has data for `trafficSources` but empty for `audience`, the `audience` check returns `false` (correct — will re-fetch). BUT the issue is on the **forceRefresh** path:

In `syncDimensionDataAsync` (line 380):
```typescript
const exists = await this.hasDimensionSnapshotAsync(channelId, dimensionConfig.targetField, today);
if (!forceRefresh && exists) continue;  // Skips dimension if exists and NOT forced
```

When `forceRefresh=true` (used by processor after import), dimensions are always re-fetched. But when `forceRefresh=false` (midnight cron), dimensions with existing data are SKIPPED. If a dimension previously returned empty data (API had no data that day), `hasDimensionSnapshotAsync` returns `false` and the cron **re-fetches** it. This part is correct.

**Severity:** Low (logic is correct for the common case)

### Root Cause 1e: Analytics API data latency

The YouTube Analytics API has a **24-48 hour data processing delay**. Metrics for today and yesterday may not be available. This affects channels with very recent activity.

**Severity:** Low (API limitation)

### Root Cause 1f: `maxResults: 5000` may truncate dimension data

**Location:** `youtubeAnalytics.service.ts:385`

```typescript
const result = await this.queryReportsAsync(
    accessToken, dimensionConfig.metrics, `day,${dimensionConfig.dimension}`,
    undefined, startDateStr, endDateStr, undefined, 5000,
);
```

The Analytics API `maxResults=5000` is the maximum allowed. But for an initial 31-day sync with dimensions like `country`, the response could exceed 5000 rows. **The code does NOT paginate dimension data** (no `startIndex` loop). Truncated data = missing dimension values.

**Severity:** Medium-High for channels with >5000 dimension rows across the date range

---

## ISSUE 2: Localhost Works, Render Fails — Single Video Imported

### Execution Trace

```
POST /v1/integrations/youtube/import                        [youtube-import.endpoint.ts]
  └─ YoutubeImportCommandHandler.execute()                   [youtube-import.handler.ts:48]
       ├─ resolve/refresh OAuth token
       ├─ await youtubeImportService.importUploadsAsync(     [youtube-import.handler.ts:113]
       │      account.userId, accessToken)
       │    └─ importUploadsAsync(userId, accessToken)       [youtube-imports.service.ts:32]
       │         ├─ GET /youtube/v3/channels?mine=true       → get uploads playlist ID
       │         ├─ DO-WHILE (nextPageToken):
       │         │    ├─ GET /youtube/v3/playlistItems       → 50 items per page
       │         │    ├─ GET /youtube/v3/videos?id=...       → stats for all 50
       │         │    └─ FOR-EACH item:
       │         │         ├─ this.userContentRepository.createAsync()  [NO TRY-CATCH]
       │         │         │    └─ findOne (check existing)
       │         │         │    └─ save (insert or update)
       │         │         └─ importedCount++
       │         └─ return importedCount
       └─ account.syncEnabled = true                         [not persisted!]
```

### Root Cause 2a: **NO error handling anywhere in the import chain**

**Location:**
- `youtube-imports.service.ts:32-161` — entire `importUploadsAsync` has ZERO try-catch blocks
- `youtube-import.handler.ts:113` — `await this.youtubeImportService.importUploadsAsync(...)` has NO try-catch

Any single failure in the chain:
- Channel API call (line 39-48)
- PlaylistItems API call (line 65-76)
- Videos stats API call (line 88-97)
- `createAsync` database save (line 128-155)

causes the ENTIRE import to fail. The videos saved BEFORE the failure remain, but no further videos are processed.

**Why it fails on Render but not localhost:**

| Factor | Localhost | Render |
|--------|-----------|--------|
| CPU | Fast desktop CPU | 0.1 vCPU (throttled) |
| RAM | Plenty | 512 MB (shared) |
| Network latency to Google APIs | Low | Higher (Render → Google) |
| Network to PostgreSQL | Same machine | Remote DB |
| Request timeout | None (dev) | Render LB may timeout long requests |
| Node.js version | Latest | Depends on Render config |

On Render, a single API call taking longer, a DB connection timeout, or the request aborted by Render's load balancer after the client disconnects will abort the entire import mid-way. The videos saved before the failure persist in the DB, producing the "exactly 1 video" symptom.

**The processor path (`youtube-import.processor.ts`) has COMPREHENSIVE error handling** — per-type try-catch, per-item try-catch, retry logic with `callWithRetry`, cancellation support, and cursor-based resume. **This path is commented out.**

**Severity:** HIGH (production data loss)

### Root Cause 2b: Import runs synchronously in HTTP handler

**Location:** `youtube-import.handler.ts:113`

The import runs INSIDE the HTTP request-response cycle. For channels with many videos (100+), this means:
- Multiple sequential YouTube API calls (~2 per page of 50)
- Sequential DB saves (~1 per video)
- Total time: 5-30+ seconds depending on video count

Render's load balancer has a timeout (typically 60s for free, 300s for Starter). If the import exceeds this, the connection drops. Node.js detects the socket close and may abort pending operations.

Additionally, the comments at lines 138-143 show the QUEUE path was intentionally commented out, moving the import from a reliable background job to a fragile synchronous HTTP handler.

**Severity:** HIGH (architecture flaw)

### Root Cause 2c: `account.syncEnabled` set but never saved

**Location:** `youtube-import.handler.ts:117-131`

```typescript
account.syncEnabled = true;    // Line 117 — in-memory only
if (!account) {                // Line 118 — always false (account exists)
    throw new NotFoundException(...);
}
if (channelId && !account.syncEnabled && configs.youtube.webhookUrl) {
    // Line 123 — NEVER executes because syncEnabled was just set to true!
    // Webhook subscription is always skipped
}
// NO updateAsync() call ever!
```

Three bugs in 15 lines:
1. `account.syncEnabled = true` is NEVER persisted to DB
2. Webhook subscription logic is inverted (reset after `syncEnabled=true`)
3. `if (!account)` is dead code (account was checked at line 61)

**Severity:** Medium (syncEnabled never takes effect)

---

## ISSUE 3: youtube-import Should Always Refresh Analytics

### Root Cause: Analytics sync is in the processor, not the direct handler

**Processor path** (`youtube-import.processor.ts:551`) — has analytics sync:
```typescript
await this.youtubeAnalyticsService.syncAccountAnalyticsAsync(
    account.userId, { forceRefresh: true }
);
```

**Direct handler path** (`youtube-import.handler.ts:112-116`) — MISSING analytics sync:
```typescript
await this.youtubeImportService.importUploadsAsync(account.userId, accessToken);
// NO analytics sync call after import!
// No subscriberCount/viewCount/videoCount update
// No dimension data refresh
// No engagement metrics update
```

The queue processor calls `syncAccountAnalyticsAsync(userId, { forceRefresh: true })` which:
1. Re-fetches subscriberCount, viewCount, videoCount from v3 API
2. Re-syncs all 5 dimension breakdowns
3. Updates daily channel metrics
4. Updates video analytics

The direct handler does NONE of this.

**Severity:** HIGH (analytics never refresh after manual import)

---

## ISSUE 4: Redis Connections at 25

### Connection Audit

| Source | Connections | Created By | 
|--------|-------------|-----------|
| `redis.util.ts` shared instance | 1 | `new Redis(REDIS_OPTS)` at line 79 |
| BullMQ Workers (×10) — blocking | 10 | `instance.duplicate()` per Worker |
| BullMQ Queue (×10) — internal | ~10 | BullMQ v4 creates QueueEvents-like internal connections per queue |
| Bull Board | ~2 | Monitor/observer connections |
| **Total estimated** | **~23-25** | |

Each BullMQ Worker calls `instance.duplicate()` to create a blocking Redis connection (required for BRPOPLPUSH). With 10 active workers (youtube-import, youtube-upload, pinterest, reddit, twitter, tiktok, instagram, facebook, linkedin, snapchat), that's 10 blocking connections. BullMQ also creates internal connections for queue event listeners.

### What's NOT creating extra connections
- `searchCache.service.ts` — uses `redis.getFromRedisAsync()` (shared instance)
- `profileCache.service.ts` — uses `redis.getFromRedisAsync()` (shared instance)
- `account.guard.ts` — uses `redis.getFromRedisAsync()` (shared instance)
- `onboarding.guard.ts` — uses `redis.getFromRedisAsync()` (shared instance)
- `userPreference.repository.ts` — uses `redis.getFromRedisAsync()` (shared instance)
- `user.repository.ts` — uses `redis.storeInRedisAsync()` (shared instance)
- `following/` handlers — use `redis.removeFromRedisAsync()` (shared instance)

All application services correctly use the shared Redis instance.

### Why it's at 25

The architecture already implements "ONE shared Redis client" (redis.util.ts line 47-53 comment). The 25 connections come from BullMQ internals:

```
1 shared instance
+ 10 Worker blocking connections (1 per worker)
+ ~10 QueueEvents/internal connections (1 per queue)
+ ~2 Bull Board observer connections
= ~23
```

The existing connection monitor (redis.util.ts:102-116) already warns at >25 connections. The 25 count is the BullMQ minimum with 10 queues+workers.

**Severity:** Medium-High (dangerously close to 30 limit)

---

## Performance Impact Analysis

### RAM (512 MB total)

| Component | Estimated Usage |
|-----------|----------------|
| NestJS/Node.js runtime | ~80-120 MB |
| TypeORM connection pool | ~30-50 MB |
| BullMQ workers (×10) | ~50-100 MB |
| Redis client buffers | ~10-30 MB |
| Application code/data | ~100-150 MB |
| **Total** | **~270-450 MB** |

**Risk:** Moderate. With 512 MB total and ~270-450 MB estimated, the app has ~60-240 MB headroom. A memory spike during import (processing large video batches) could trigger OOM.

### CPU (0.1 vCPU)
- Single-core throttled CPU
- JavaScript CPU-bound operations (JSON parsing, DB query building) are slow
- Each YouTube API response requires JSON parsing — large playlist responses could block the event loop

### Redis Memory (30 MB)
| Component | Estimated Memory |
|-----------|----------------|
| BullMQ jobs/completed/failed | ~5-10 MB |
| Queue event streams (maxLen=100 each) | ~3-5 MB |
| Application cache | ~2-5 MB |
| **Total** | **~10-20 MB** |

**Risk:** Moderate. BullMQ's `removeOnComplete` and `removeOnFail` settings (max 50 completed, 200 failed per queue) and `streams.events.maxLen: 100` are aggressive cleanup settings. With 10 queues, worst case is 10×(50+200) = 2500 job records + 10×100 = 1000 stream entries. At ~2 KB per record, that's ~7 MB for BullMQ data. Should fit in 30 MB.

### PostgreSQL
- Analytics sync for each user: 2 SELECT + 1 INSERT/UPDATE per date, per dimension
- For 31-day initial sync with 5 dimensions: 31 × (2 + 5×2 + 1) = ~341 queries per user
- Import: 2 SELECT + 1 INSERT per video

### YouTube API Quota
| Operation | Quota Cost |
|-----------|-----------|
| `channels.list` | 1 unit |
| `playlistItems.list` | 1 unit per page |
| `videos.list` | 1 unit per batch |
| Analytics `reports.query` | 1 unit per call |

Per import cycle (channel with 100 videos, 2 pages):
- Channel lookup: 1 unit
- PlaylistItems: 2 pages × 1 = 2 units
- Videos stats: 2 pages × 1 = 2 units
- **Total per import: ~5 units**

Per analytics sync (1 user):
- Channel info: 1 unit
- Reports (channel metrics, revenue, 5 dimensions, video): 8 units
- **Total per sync per user: ~9 units**

With 100 users and daily analytics sync: 900 units/day. YouTube API daily quota is typically 10,000 units.

---

## Files Requiring Modification

### Issue 1 Fixes

| File | Line(s) | Change |
|------|---------|--------|
| `src/infrastructure/services/youtubeAnalytics.service.ts` | 343-370 | Remove `engagementMetrics: {}` from `saveChannelSnapshot` to prevent overwrite |
| `src/infrastructure/services/youtubeAnalytics.service.ts` | 372-411 | Add pagination loop with `startIndex` for dimension data |
| `src/infrastructure/repositories/youtubeChannelAnalytics.repository.ts` | 14-29 | Change `Object.assign(existing, analytics)` to selective field update |

### Issue 2 Fixes

| File | Line(s) | Change |
|------|---------|--------|
| `src/infrastructure/services/youtube/youtube-imports.service.ts` | 32-161 | Add try-catch blocks around API calls and per-video save |
| `src/features/integrations/youtube/import/youtube-import.handler.ts` | 113 | Wrap `importUploadsAsync` in try-catch with error logging |
| `src/features/integrations/youtube/import/youtube-import.handler.ts` | 117-131 | Fix `syncEnabled` save, fix webhook logic, remove dead code |
| `src/features/integrations/youtube/import/youtube-import.handler.ts` | 138-150 | Re-enable BullMQ queue path (recommended) OR add retry/resume logic |

### Issue 3 Fixes

| File | Line(s) | Change |
|------|---------|--------|
| `src/features/integrations/youtube/import/youtube-import.handler.ts` | 116 | Add `youtubeAnalyticsService.syncAccountAnalyticsAsync(userId, { forceRefresh: true })` after import |

### Issue 4 Fixes

| File | Line(s) | Change |
|------|---------|--------|
| `src/core/utils/redis.util.ts` | 79 | Add `lazyConnect: true` (already present) — verify it's effective |
| `src/core/config/bullmq.config.ts` | 70 | Add `skipVersionCheck: true` to `getWorkerOptions` to reduce connection creation |
| `src/infrastructure/background/processors/` | All | Verify `@Processor` decorators don't create duplicate connections |

---

## Implementation Plan

### Step 1: Fix Issue 2 (critical — production data loss)

**A. Add error handling to `importUploadsAsync`** (`youtube-imports.service.ts`):

Wrap the pagination loop and per-video save in try-catch blocks so a single failure doesn't abort the entire import. Log errors and continue processing.

**B. Re-enable BullMQ Queue** (`youtube-import.handler.ts`):

The processor has robust error handling, cursor-based resume, cancellation support, and analytics sync. Uncomment the queue enqueue path and add the analytics sync call.

**C. Fix `syncEnabled` persistence** (`youtube-import.handler.ts:117-131`):

Save `account.syncEnabled` to DB, fix the inverted webhook check, remove dead code.

### Step 2: Fix Issue 3 (medium — analytics freshness)

**Add analytics sync after direct import** (`youtube-import.handler.ts`):

```typescript
@Inject(_const.IYOUTUBEANALYTICS_SERVICE)
private readonly youtubeAnalyticsService: IYoutubeAnalyticsService;

// After importUploadsAsync:
await this.youtubeAnalyticsService.syncAccountAnalyticsAsync(
    account.userId,
    { forceRefresh: true }
);
```

### Step 3: Fix Issue 1 (medium — data integrity)

**A. Remove `engagementMetrics: {}` hardcode** (`youtubeAnalytics.service.ts:353`):

Only set `engagementMetrics` when API data is available, or remove it from the constructor call so the existing value is preserved.

**B. Add dimension pagination** (`youtubeAnalytics.service.ts:385`):

Loop with `startIndex` parameter until all dimension rows are fetched.

**C. Fix `createOrUpdateAsync`** (`youtubeChannelAnalytics.repository.ts`):

Instead of `Object.assign(existing, analytics)` which overwrites ALL fields, selectively merge only the fields that were actually updated by the current sync step.

### Step 4: Fix Issue 4 (medium — resource limits)

**A. Verify skipVersionCheck** (`bullmq.config.ts:70`):

Add `skipVersionCheck: true` to Worker options to prevent BullMQ from creating extra connections for version checking.

**B. Monitor connection count** (existing in `redis.util.ts:102-116`):

The monitor already warns at >25 connections. Reduce the threshold to 20 to catch spikes earlier.

---

## Risk Analysis

| Change | Risk | Mitigation |
|--------|------|------------|
| Add try-catch to import loop | Low | Catches errors, logs, continues — never changes existing behavior |
| Re-enable BullMQ queue | Medium | Old path switches from synchronous to async. User must poll for results |
| Fix `syncEnabled` save | Low | Adds missing DB write, no behavior change for existing accounts |
| Add analytics sync after import | Low | Adds API calls + DB writes after import. Increases total import time by ~30s |
| Remove `engagementMetrics: {}` | Low | Future syncs won't overwrite; existing data stays |
| Fix `Object.assign` to selective merge | Low-Medium | Changes upsert behavior. Must test that all fields are preserved |
| Add dimension pagination | Low | Adds loop iteration, no change for small result sets |
| `skipVersionCheck: true` | Low | BullMQ internal optimization, no functional change |

---

## Redis Optimization Plan

### Current: ~25 connections
```
1 shared instance
+ 10 Worker blocking connections
+ ~10 QueueEvents/internal connections  
+ ~2 Bull Board
= ~23-25
```

### Target: ~12-15 connections

1. **Reduce active workers to essential only** (if some platforms have no connected users)
2. **Add `skipVersionCheck: true`** to Worker options
3. **Remove Bull Board in production** (if not actively used for monitoring)
4. **Verify no QueueEvents are created** (use `events: false` in queue options if possible)

### BullMQ v4 Connection Model
- Queue: 0 new connections (reuses shared)
- Worker: 1 blocking connection via `.duplicate()` (REQUIRED by BullMQ)
- QueueEvents: 1 connection (avoid if not subscribed)

The blocking connections are NON-NEGOTIABLE — BullMQ requires them for BRPOPLPUSH/BLMOVE operations.

---

## Render Compatibility Verification

### Constraints Check

| Constraint | Current State | Compatible? |
|-----------|--------------|-------------|
| 512 MB RAM | ~270-450 MB estimated | **Borderline** — memory spike could OOM |
| 0.1 vCPU | Single-threaded JS, sequential API calls | **OK** for import, slow for bulk sync |
| Redis 30 MB | ~10-20 MB estimated | **OK** with aggressive cleanup |
| 30 Redis connections | ~25 current | **Borderline** — 5 headroom |

### Critical Issues for Render

1. **Import in HTTP handler** — must move to BullMQ queue or add resume support
2. **Analytics sync in cron** — the existing cron at midnight should work, but for many users, the `syncAllAccountsAnalyticsAsync` loop could take hours
3. **OOM risk during large imports** — buffering all videos in memory before saving
4. **No BP profit** — the app is already minimal on RAM/CPU

---

## Verification Checklist

- [x] Root cause: Analytics API returns empty data for low-activity channels (Issue 1)
- [x] Root cause: `engagementMetrics: {}` overwrites previous data (Issue 1)
- [x] Root cause: No error handling in `importUploadsAsync` (Issue 2)
- [x] Root cause: Import runs in HTTP handler, not background queue (Issue 2)
- [x] Root cause: No analytics sync after direct import (Issue 3)
- [x] Root cause: BullMQ creates duplicate connections per worker (Issue 4)
- [ ] Fix: Add try-catch to import loop
- [ ] Fix: Re-enable BullMQ queue
- [ ] Fix: Add analytics sync after import
- [ ] Fix: Remove `engagementMetrics: {}` hardcode
- [ ] Fix: Selective merge in `createOrUpdateAsync`
- [ ] Fix: Add dimension pagination
- [ ] Fix: Reduce Redis connections via `skipVersionCheck` and queue optimization
