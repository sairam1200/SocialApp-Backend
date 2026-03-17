# Walkthrough: Analytics Implementation

I have successfully implemented the full Analytics feature following Gaddr's **Clean Architecture**, **CQRS**, and **Repository** patterns.

## 🛠 Changes Summary

### 1. Domain Layer
*   **Entities**: Created `AnalyticsEvent` for raw logs and `PremiumRollup` for weekly aggregations in `src/domain/entities/`.
*   **Interfaces**: Defined `IAnalyticsRepository`, `IPremiumRollupRepository`, and `IAnalyticsService` in `src/domain/repositories/` and `src/domain/services/`.

### 2. Infrastructure Layer
*   **Concrete Repositories**: Implemented `AnalyticsRepository` and `PremiumRollupRepository` using TypeORM in `src/infrastructure/repositories/`.
*   **Analytics Service**: Created a thin `AnalyticsService` facade for high-level event tracking.
*   **Dependency Injection**: Wired all new components into `src/infrastructure/dependency.ts`.
*   **Background Task**: Added `PremiumRollupCron` in `src/infrastructure/background/cron/jobs/` to aggregate data weekly.

### 3. Feature Slice (CQRS)
*   **Endpoint**: Added `GET /v1/analytics/weekly-stats` with `AuthenticatedAccountGuard`.
*   **Handler**: Implemented `GetWeeklyStatsQueryHandler` to fetch pre-aggregated data for the dashboard.
*   **Module**: Created a dedicated `AnalyticsModule` and registered it in the root `AppModule`.

### 4. Database
*   **Schema**: Added a manual migration `1771461111000-CreateSchemaAnalytics.ts` to create the `analytics` schema.

---

## ✅ Verification Results

*   **Build Status**: Verified that the entire implementation compiles successfully with `npx tsc --noEmit`.
*   **Architectural Check**: Confirmed adherence to the project's vertical slice and barrel export patterns.
*   **Unit Tests**: Created and ran 3 test suites (6 tests total) to verify core logic:
    *   `AnalyticsService`: Verified event tracking delegation.
    *   `PremiumRollupCron`: Verified weekly aggregation logic (grouping, counting, and top-feature calculation).
    *   `GetWeeklyStatsQueryHandler`: Verified data retrieval.
*   **Result**: 🟢 **PASS** (All 6 tests passed).

> [!IMPORTANT]
> Since the local database was not reachable during the task (`ECONNREFUSED` on port 5433), I could not generate the table-creation migrations or run them.

---

## 🚀 Next Steps

1.  Ensure your PostgreSQL instance is running.
2.  Run the migration generator to create the table structures:
    ```bash
    npm run migration:generate -- src/infrastructure/migrations/AddAnalytics
    ```
3.  Run the migrations:
    ```bash
    npm run migration:run
    ```

---

## 🎓 Code Architecture Breakdown (for the new intern)

Welcome to the team! Here is how the path of an analytic event works in this codebase:

1.  **Usage**: You call `AnalyticsService.trackEvent('VIDEO_PLAY', userId, { videoId: '123' })` from any business logic (e.g., a Handler).
2.  **Tracking**: The Service calls the `AnalyticsRepository`, which saves a raw row in the `analytics_events` table.
3.  **Rollup**: Once a week, `PremiumRollupCron` wakes up, queries all raw events from the last 7 days, groups them by user, and calculates "Top Feature Used" and "Total Interactions". It saves this "Rollup" into a separate table.
4.  **Querying**: When the frontend asks for stats, the `GetWeeklyStatsController` triggers a CQRS Query. The `GetWeeklyStatsQueryHandler` reads directly from the `PremiumRollup` table.

### Why do we do this?
This follows the **CQRS** (Command Query Responsibility Segregation) pattern:
*   **Write Side**: RAW events (slow to query in bulk, but fast to insert).
*   **Read Side**: Pre-aggregated rollups (fast to query for dashboards).

*This ensures the dashboard remains extremely fast even as the number of logged events grows into the millions.*
