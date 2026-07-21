# 11 — Rollback Strategy (Session 8)

**Date:** 2026-07-19
**Scope:** Rollback procedures for all identified risks across database, authentication, ORM, and deployment

---

## 1. Rollback Tiers

| Tier | Trigger | Method | Time | Data Loss |
|------|---------|--------|------|-----------|
| T1 | Code bug | Git revert + redeploy | < 2 min | None |
| T2 | Migration failure | `migration:revert` | < 5 min | None (if down() exists) |
| T3 | Data corruption | `pg_restore` from backup | < 60 sec | Delta since backup |
| T4 | Full system failure | Restore to Docker container, replay | < 30 min | Up to backup interval |

---

## 2. Database Rollback

### 2.1 Migration Rollback

**Prerequisite:** Every TypeORM migration MUST have a complete `down()` method.

**Current Status:** 44 migrations exist. Down methods were verified during `05_Migration_Strategy.md` Phase 2.

**Procedure:**
```bash
# Revert last migration
npx typeorm migration:revert -d ./dist/infrastructure/persistence/data.source.js

# Revert N migrations (run N times)
for i in $(seq 1 N); do
  npx typeorm migration:revert -d ./dist/infrastructure/persistence/data.source.js
done
```

**Risk:** If a migration's `down()` is incomplete, the revert may fail. This is documented in `05_Migration_Strategy.md` Phase 2.

### 2.2 Backup & Restore

**Backup Procedure (Pre-Migration):**
```bash
# Full backup in CUSTOM format (compressed, restoreable)
pg_dump -Fc -h $HOST -U $USER -d $DB -f backup_$(date +%Y%m%d_%H%M%S).dump

# Schema-only backup (for drift detection)
pg_dump -s -h $HOST -U $USER -d $DB -f schema_$(date +%Y%m%d_%H%M%S).sql

# Row count snapshot (for verification)
psql -h $HOST -U $USER -d $DB -c "
SELECT schemaname, relname, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY schemaname, relname;
" > row_counts_$(date +%Y%m%d_%H%M%S).txt
```

**Restore Procedure (Full Recovery):**
```bash
# Drop and recreate database
dropdb $DB && createdb $DB

# Restore from backup
pg_restore -h $HOST -U $USER -d $DB backup.dump

# Verify row counts
diff row_counts_before.txt row_counts_after.txt
```

**Recovery Time:** < 60 seconds for typical backup (236KB compressed, per RESTORE_REPORT).

### 2.3 Specific Migration Rollbacks

| Migration | Risk | Rollback Procedure |
|-----------|------|-------------------|
| `1783167267344` (userContentUserIdToUuid) | HIGH — UUID type change | `ALTER TABLE public.user_content ALTER COLUMN "userId" TYPE varchar;` + data cast back |
| `1783167267345` (userContentAddForeignKey) | MEDIUM — FK addition | `ALTER TABLE public.user_content DROP CONSTRAINT IF EXISTS FK_...;` |
| `1784000000000` (CreatePublishJobsTable) | LOW — New table | `DROP TABLE IF EXISTS public.publish_jobs;` |
| `1784000000001` (AddUploadIdToPublishJobs) | LOW — Additive column | `ALTER TABLE public.publish_jobs DROP COLUMN "uploadId";` |
| `1784000000002` (MakeUploadJobVideoIdNullable) | LOW — Relax constraint | `ALTER TABLE public.upload_jobs ALTER COLUMN "videoId" SET NOT NULL;` |

### 2.4 Orphan Record Cleanup

If FK constraints are added and orphaned rows exist:
```sql
-- Find orphans
SELECT ur.id FROM identity.userRoles ur
LEFT JOIN identity.users u ON ur."userId" = u.id
WHERE u.id IS NULL;

-- Delete orphans (safe — no FK references them)
DELETE FROM identity.userRoles ur
WHERE NOT EXISTS (SELECT 1 FROM identity.users u WHERE u.id = ur."userId");

-- Repeat for: userClaims, userLogins, linkedAccounts, notifications, publish_jobs
```

---

## 3. Authentication Rollback

### 3.1 Password Hashing Regression

**Scenario:** After switching from bcrypt to Argon2id, some users cannot log in.

**Rollback:**
1. Revert code change (Git revert)
2. Redeploy
3. Old bcrypt hashes still work — no data change needed

**Forward Fix (preferred):**
1. Detect which users have Argon2id hashes
2. Re-hash those passwords with bcrypt on next successful login
3. Or: dual-hash — store both `bcrypt_hash` and `argon2_hash` columns temporarily

### 3.2 JWT Secret Rotation

**Scenario:** JWT secret is compromised or needs rotation.

**Rollback:**
1. Revert to old secret
2. All existing tokens remain valid
3. Users don't need to re-login

**Forward Fix:**
1. Deploy new secret
2. Old tokens expire naturally (7-day access, 30-day refresh)
3. During transition: validate against both old and new secrets
4. After 30 days: remove old secret validation

**Implementation:**
```typescript
// In jwt.util.ts — support dual-secret validation
const secrets = [configs.jwt.secret, configs.jwt.previousSecret].filter(Boolean);
for (const secret of secrets) {
  try {
    return await jwtService.verifyAsync(token, { secret, ... });
  } catch { continue; }
}
```

### 3.3 Refresh Token Invalidation

**Scenario:** Mass token invalidation (security breach).

**Procedure:**
```sql
-- Invalidate all refresh tokens
UPDATE identity.user_logins SET "isValid" = false;

-- Or: delete all sessions
DELETE FROM identity.user_logins;
```

**Impact:** All users must re-login. No data loss beyond session state.

### 3.4 OAuth Configuration Rollback

**Scenario:** OAuth provider configuration is wrong (callback URL, client ID).

**Rollback:**
1. Revert env var changes
2. Redeploy
3. Users mid-OAuth-flow will fail and need to retry

**Mitigation:** Test OAuth flow in staging before production deployment.

---

## 4. ORM Rollback

### 4.1 Entity Definition Changes

**Scenario:** Entity columns don't match deployed schema.

**Rollback:**
1. Revert entity changes to match deployed schema
2. Redeploy
3. No database changes needed

**Verification:**
```bash
# Check if entities match schema
npx typeorm migration:generate -d ./dist/infrastructure/persistence/data.source.js
# If output is empty → entities match schema
# If output has changes → schema drift exists
```

### 4.2 TypeORM to Drizzle Migration Rollback

**Scenario:** During the planned TypeORM → Drizzle migration, Drizzle migrations cause issues.

**Rollback:**
1. Revert to TypeORM code (git revert to pre-migration commit)
2. TypeORM migrations are idempotent — old code works with new schema
3. Drizzle migrations that added objects can be reverted via Drizzle's `down()`

**Critical Rule:** Never drop TypeORM-managed objects until Drizzle is fully validated (Phase 7 of `05_Migration_Strategy.md`).

---

## 5. Deployment Rollback

### 5.1 Cloud Run Rollback

```bash
# List recent revisions
gcloud run revisions list --service=gaddr-backend --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic gaddr-backend \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

**Recovery Time:** < 30 seconds (Cloud Run traffic routing)

### 5.2 Redis Flush & Rebuild

**Scenario:** Redis contains corrupted cache data.

```bash
# Flush specific keys (safest)
redis-cli KEYS "profile:*" | xargs redis-cli DEL
redis-cli KEYS "session:*" | xargs redis-cli DEL

# Full flush (nuclear option)
redis-cli FLUSHALL
```

**Impact:** Cache miss storm on next requests. DB load increases temporarily. Self-healing as cache rebuilds.

### 5.3 BullMQ Job Replay

**Scenario:** Jobs stuck or corrupted.

```sql
-- Find failed jobs
SELECT * FROM bullmq_jobs WHERE status = 'failed';

-- Reset to pending for retry
UPDATE bullmq_jobs SET status = 'pending', attempts = 0 WHERE status = 'failed';
```

---

## 6. Cross-Project Rollback

### 6.1 Shared Identity Bridge Failure

**Scenario:** `UserIdMapping` table causes issues in one project.

**Rollback:**
1. Revert both projects to pre-bridge code
2. `UserIdMapping` table remains (no harm — no other table references it)
3. Both projects continue independently

**Data Preservation:** All user data remains in both systems. No rows are deleted or modified by the bridge.

### 6.2 Schema Change in Shared Table

**Scenario:** Project B adds a column to `identity.users` that breaks Project A.

**Rollback:**
1. Project B reverts the migration
2. Project A continues working with old schema
3. Verify: `pg_dump -s` shows no drift between projects

**Prevention:** Schema Change RFC process (see `08_Final_Architecture_Review.md` §5.3).

---

## 7. Backup Schedule

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Full pg_dump (CUSTOM) | Daily | 30 days | Cloud Storage |
| Schema-only dump | On every migration | Indefinite | Git (in docs/) |
| Row count snapshot | Weekly | 90 days | Cloud Storage |
| Pre-migration backup | Every migration | Until next migration | Local + Cloud |
| Redis snapshot | Every 6 hours | 7 days | Cloud Storage |

**Automation:** `05_Migration_Strategy.md` Phase 0 recommends automating backups. Currently manual.

---

## 8. Rollback Decision Matrix

| Symptom | First Action | Escalation |
|---------|-------------|------------|
| Migration fails to start | Check logs, fix migration, redeploy | Revert migration, redeploy |
| Migration fails mid-execution | STOP. Do not retry. Assess damage. | Restore from backup |
| Users can't log in | Check JWT secret, check DB connection | Revert last deployment |
| Data appears missing | Check soft-delete flags, check Redis cache | `pg_restore` from backup |
| Performance degradation | Check connection pool, check Redis, check indexes | Rollback last schema change |
| Redis connection errors | Reduce queue workers, restart Redis | Flush Redis, rebuild |
| BullMQ jobs stuck | Check worker logs, restart workers | Replay failed jobs |

---

## 9. Recovery Time Objectives

| Scenario | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|----------|------------------------------|-------------------------------|
| Code regression | 2 min (Git revert + deploy) | 0 (no data change) |
| Migration failure | 5 min (revert migration) | 0 (if caught before data mutation) |
| Data corruption | 60 sec (pg_restore) | Up to backup interval (max 24 hrs) |
| Full system failure | 30 min (full restore) | Up to backup interval |
| Security breach | Immediate (invalidate tokens) | Depends on breach scope |

---

## 10. Pre-Deployment Checklist

Before any production deployment:

- [ ] Full `pg_dump` backup taken
- [ ] Migration `down()` method verified locally
- [ ] `migration:generate` produces expected diff (or zero diff)
- [ ] All 14+ BullMQ processors start without error
- [ ] Redis connection count verified (< 25)
- [ ] JWT secret unchanged (or dual-secret deployed)
- [ ] Health check endpoint returns 200
- [ ] Staging soak period completed (48 hrs for schema changes)
- [ ] Rollback procedure documented for this specific change
- [ ] Both projects' deploy status confirmed (no simultaneous deploys unless tested)

---

## Summary

| Rollback Type | Max Time | Data Loss | Automation |
|---------------|----------|-----------|------------|
| Code revert | 2 min | None | `gcloud run` traffic routing |
| Migration revert | 5 min | None | TypeORM CLI |
| Full restore | 60 sec | Delta since backup | `pg_restore` |
| Redis flush | 30 sec | Cache only | Self-healing |
| Token invalidation | Immediate | Sessions only | SQL + restart |
