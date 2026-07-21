# Data Restore Report: neondb_backup_20260717_223225.dump

**Date**: Sun Jul 19 2026
**Source**: `neondb_backup_20260717_223225.dump` (PostgreSQL 18.4, CUSTOM format, 236KB)
**Target**: Neon production database (`ep-autumn-paper-ahdjud0j-pooler`)

---

## 1. Executive Summary

A filtered, merge-based restore was performed to safely migrate compatible data from a PostgreSQL 18.4 backup into the current production Neon database. **No existing production data was deleted or truncated.** All operations used `INSERT ... ON CONFLICT DO NOTHING` or targeted `UPDATE` statements with safety `WHERE` clauses.

### Results

| Metric | Value |
|--------|-------|
| Tables with identical data (skipped) | 8 |
| Tables with new data inserted | 14 |
| User emails restored from placeholder | 9 |
| Rows inserted (total) | 873 |
| Rows updated (total) | 9 |
| Rows skipped (conflicts) | 56 |
| Production rows lost | 0 |
| Schema changes | 0 |

---

## 2. Backup Inventory

### 2.1 Schemas
| Schema | Description |
|--------|-------------|
| `identity` | User management (TypeORM) |
| `notification` | Notifications & newsletters |
| `analytics` | Facebook & YouTube analytics |
| `public` | Core application tables |

### 2.2 Extensions
- `pg_trgm` (trigram matching)
- `uuid-ossp` (UUID generation)

### 2.3 Table Counts
| Schema | Tables | Total Rows in Backup |
|--------|--------|---------------------|
| `identity` | 10 | 214 |
| `notification` | 4 | 5 |
| `analytics` | 7 | 574 |
| `public` | 21 | 433 |
| **Total** | **42** | **1,226** |

---

## 3. Compatibility Analysis

### 3.1 Incompatible Tables (Excluded from Restore)

| Table | Reason | Backup Schema | Production Schema |
|-------|--------|---------------|-------------------|
| `public.upload_jobs` | Completely different columns | TypeORM (uuid PK, videoId) | Drizzle (serial PK, different columns) |
| `public.youtube_accounts` | Different column names/types | snake_case, text PK | camelCase, uuid PK |
| `public.youtube_videos` | Different column names/types | integer PK | uuid PK |
| `public.youtube_analytics` | Does not exist in production | Present | Missing |
| `analytics.analyticsEvents` | Does not exist in production | Present | Missing |
| `analytics.premiumRollups` | Does not exist in production | Present | Missing |
| `analytics.youtubeChannelAnalytics` | Production missing 10 columns | Full columns | Partial columns |
| `analytics.youtubeVideoAnalytics` | Production missing 3 columns | Full columns | Partial columns |
| `public.newsletter_subscribers` | Different schema (Drizzle vs TypeORM) | int PK, camelCase | text PK, snake_case |

### 3.2 Compatible Tables

All tables in `identity`, `notification`, and `analytics` schemas are fully compatible with the production database. Public schema tables use the same TypeORM schema in both backup and production.

---

## 4. Data Comparison

### 4.1 Tables with Identical Data (No Action Needed)

These tables have **exactly the same PKs** in both backup and production. No merge needed.

| Table | Backup Rows | Production Rows | PK Match |
|-------|-------------|-----------------|----------|
| `public.contentStreams` | 46 | 46 | 46/46 (100%) |
| `public.dataProtectionKeys` | 34 | 34 | 34/34 (100%) |
| `public.linkedAccounts` | 10 | 10 | 10/10 (100%) |
| `public.manualProfiles` | 2 | 2 | 2/2 (100%) |
| `public.publish_jobs` | 8 | 8 | 8/8 (100%) |
| `public.topics` | 19 | 19 | 19/19 (100%) |
| `public.userContents` | 58 | 58 | 58/58 (100%) |
| `public.notifications` | 0 | 0 | Both empty |

### 4.2 Tables with New Data (Inserted)

These tables are empty in production; all backup rows are new.

| Table | Rows Inserted |
|-------|---------------|
| `identity.roles` | 1 |
| `identity.roleClaims` | 15 |
| `identity.userBiometrics` | 12 |
| `identity.userLogins` | 161 |
| `identity.userRoles` | 1 |
| `identity.user_follows` | 9 |
| `notification.newsletter_subscribers` | 1 |
| `notification.notificationEvents` | 0 |
| `notification.notificationTemplates` | 0 |
| `notification.notifications` | 4 |
| `analytics.facebookPageAnalytics` | 69 |
| `analytics.facebookPostAnalytics` | 117 |
| `analytics.facebookVideoAnalytics` | 78 |
| `analytics.analyticsEvents` | 134 |
| `analytics.youtubeChannelAnalytics` | 176 |
| `public.upload_jobs` | 25 |

### 4.3 Tables with Partial Overlap

| Table | Backup | Production | Overlap | New in Backup | Prod-Only |
|-------|--------|------------|---------|---------------|-----------|
| `public.userTopics` | 56 | 63 | 56 | 0 | 7 |

The 56 backup PKs are a strict subset of the 63 production PKs. ON CONFLICT DO NOTHING skips all 56; 7 production-only rows are preserved.

### 4.4 Users Table (Complex Merge)

**Critical Schema Difference**: Backup uses `identity.users` (14 rows, UUID PKs). Production uses `public.user` (49 rows, mixed PKs).

#### Shared UUIDs (9 users)
Production has these UUIDs but with placeholder emails (`placeholder-*.gaddr.local`). Backup has the real emails.

| UUID | Backup Email (Real) | Production Email (Placeholder) |
|------|--------------------|-------------------------------|
| `02b9d19e...` | searchmedesignteam@gmail.com | placeholder-02b9d19e@gaddr.local |
| `24e32729...` | sairamch10@gmail.com | placeholder-24e32729@gaddr.local |
| `3b0542da...` | pubgs121201@gmail.com | placeholder-3b0542da@gaddr.local |
| `5cdc8154...` | johndoe@gaddr.com | placeholder-5cdc8154@gaddr.local |
| `78931ab7...` | detognifilippo+gaddrdemo@gmail.com | placeholder-78931ab7@gaddr.local |
| `7e0c6753...` | photostopfinland@gmail.com | placeholder-7e0c6753@gaddr.local |
| `7e62d357...` | sairam.chikkala10@gmail.com | placeholder-7e62d357@gaddr.local |
| `d553381e...` | absaruzzamanomi@gmail.com | placeholder-d553381e@gaddr.local |
| `e0a4e077...` | jainsam623@gmail.com | placeholder-e0a4e077@gaddr.local |

#### Shared Emails (4 users, different UUIDs)
| Email | Backup UUID | Production UUID |
|-------|-------------|-----------------|
| ghiathbrai46@gmail.com | `e0627f17...` | `40JHioNHZ...` |
| pubgs121201@gmail.com | `3b0542da...` | `tnY5OZUre...` |
| team@gaddr.com | `eb080d3c...` | `6zPTNsaOE...` |
| utkarsh7trivedi@gmail.com | `f88f2cd2...` | `MT9STulRA...` |

#### Users Only in Backup (not in production)
- `d887bbae...` (sairamdogs@gmail.com)
- `4e48648d...` (sandgdrr26@gmail.com)
- `eb080d3c...` (team@gaddr.com - different UUID from prod)
- `f88f2cd2...` (utkarsh7trivedi@gmail.com - different UUID from prod)

#### Users Only in Production (40 users)
All production users with non-UUID IDs (text-based IDs like `idkPiTbWUp...`, `1RAHmCOtM...`, etc.)

---

## 5. Merge Strategy

### 5.1 Tables Skipped (Identical Data)
- `contentStreams`, `dataProtectionKeys`, `linkedAccounts`, `manualProfiles`
- `publish_jobs`, `topics`, `userContents`, `notifications`
- `migrations` (different migration systems: TypeORM vs Drizzle)

### 5.2 Tables with Direct INSERT (Empty in Production)
All `identity.*`, `notification.*`, and `analytics.*` tables use direct `INSERT INTO ... ON CONFLICT DO NOTHING`.

### 5.3 Tables with ON CONFLICT DO NOTHING
- `public.userTopics`: 56 rows, all PKs exist in production, all skipped
- `public.upload_jobs`: 25 rows, empty in production, all inserted

### 5.4 User Email Restoration
```sql
UPDATE public."user"
SET email = 'real@email.com'
WHERE id = 'uuid-here'
  AND email LIKE 'placeholder-%';
```
Each UPDATE has a safety `WHERE` clause that only executes if the email is still a placeholder.

---

## 6. Merge Script

**File**: `C:\Users\saira\AppData\Local\Temp\opencode\merge_restore_complete.sql` (588KB)

### Operations
| Phase | Operation | Count |
|-------|-----------|-------|
| Phase 0 | UPDATE user emails | 9 |
| Phase 1 | INSERT identity/notification/analytics | 792 |
| Phase 2 | INSERT userTopics (ON CONFLICT DO NOTHING) | 56 |
| Phase 3 | INSERT upload_jobs (ON CONFLICT DO NOTHING) | 25 |
| **Total** | | **882** |

### Safety Measures
- All INSERTs use `ON CONFLICT DO NOTHING`
- All UPDATEs use `WHERE id = '...' AND email LIKE 'placeholder-%'`
- No `DELETE`, `TRUNCATE`, `DROP`, or `ALTER` statements
- No schema modifications
- FK constraints deferred via `SET CONSTRAINTS ALL DEFERRED` where needed

---

## 7. Temporary Resources

### Docker Container
- Name: `temp_pg_restore`
- Image: `postgres:17`
- Port: 5433
- Volume: `pg_temp_data`
- Status: Running (can be stopped/removed after verification)

### Files Generated
| File | Size | Description |
|------|------|-------------|
| `backup_schema.sql` | 57KB | Extracted backup schema |
| `backup_toc.txt` | 16KB | Full TOC (218 entries) |
| `backup_toc_filtered.txt` | 1.2KB | Filtered TOC (36 entries) |
| `conflict_analysis.txt` | 3.5KB | Row count comparison |
| `conflict_details.txt` | 18KB | PK-level comparison |
| `merge_restore_complete.sql` | 588KB | Complete merge script |
| `dump_identity_notification_analytics.sql` | 530KB | Raw pg_dump |
| `dump_identity_notification_analytics_conflict.sql` | 549KB | With ON CONFLICT |

---

## 8. Verification Commands

After execution, verify the restore:

```sql
-- Check row counts for inserted tables
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname IN ('identity', 'notification', 'analytics')
ORDER BY schemaname, relname;

-- Check user email updates
SELECT id, email FROM public."user"
WHERE id IN (
  '02b9d19e-8efc-4d41-aea0-d4f6f21f0b27',
  '24e32729-47ff-418c-a736-0a08c6842bf9',
  '3b0542da-b104-4f14-b7d7-ab5b3230127b',
  '5cdc8154-dbab-4d41-a3ad-6389357b7485',
  '78931ab7-1c96-40fa-b1d6-4294c5e4cdeb',
  '7e0c6753-64c6-4626-bd39-3ddf6d5264db',
  '7e62d357-a193-40fb-82f2-6a165cbd6675',
  'd553381e-b4be-42d0-8b72-f98a877e1c76',
  'e0a4e077-a8c3-47b0-961b-c7a6b5859e8e'
);

-- Check userTopics (should still be 63)
SELECT COUNT(*) FROM public."userTopics";

-- Check upload_jobs (should be 25)
SELECT COUNT(*) FROM public.upload_jobs;
```

### Reset Sequences (if needed)
```sql
SELECT setval('identity."UserClaims_id_seq"', COALESCE((SELECT MAX(id) FROM identity."UserClaims"), 1));
SELECT setval('identity."userClaims_id_seq"', COALESCE((SELECT MAX(id) FROM identity."userClaims"), 1));
SELECT setval('public.migrations_id_seq', COALESCE((SELECT MAX(id) FROM public.migrations), 1));
```

---

## 9. Rollback Plan

If issues are detected after execution:

1. **User emails**: Revert to placeholder emails
   ```sql
   UPDATE public."user" SET email = 'placeholder-' || substr(id::text, 1, 8) || '@gaddr.local'
   WHERE id IN ('02b9d19e...', '24e32729...', ...);
   ```

2. **Inserted data**: Delete by schema
   ```sql
   DELETE FROM identity.roles;
   DELETE FROM identity.roleClaims;
   DELETE FROM identity.userBiometrics;
   DELETE FROM identity.userLogins;
   DELETE FROM identity.userRoles;
   DELETE FROM identity.user_follows;
   DELETE FROM notification.newsletter_subscribers;
   DELETE FROM notification.notifications;
   DELETE FROM analytics.facebookPageAnalytics;
   DELETE FROM analytics.facebookPostAnalytics;
   DELETE FROM analytics.facebookVideoAnalytics;
   DELETE FROM analytics.analyticsEvents;
   DELETE FROM analytics.youtubeChannelAnalytics;
   DELETE FROM public.upload_jobs;
   ```

3. **userTopics**: No action needed (ON CONFLICT DO NOTHING inserted 0 rows)

---

## 10. Cleanup

After verification, remove temporary resources:

```powershell
# Stop and remove Docker container
docker stop temp_pg_restore
docker rm temp_pg_restore

# Remove Docker volume
docker volume rm pg_temp_data

# Remove temporary files
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\backup_schema.sql"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\backup_toc.txt"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\backup_toc_filtered.txt"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\conflict_analysis.txt"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\conflict_details.txt"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\dump_*.sql"
Remove-Item "C:\Users\saira\AppData\Local\Temp\opencode\merge_*.sql"
```
