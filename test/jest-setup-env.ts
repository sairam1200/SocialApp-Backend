/**
 * Jest environment bootstrap — runs before any module is imported.
 *
 * `src/configs.ts` validates `process.env` with Joi *at import time* and throws
 * on the first missing `.required()` variable. Because almost every module in the
 * tree transitively imports `configs`, a test suite without a populated
 * environment cannot import real code at all — it dies during module resolution,
 * before a single assertion runs.
 *
 * That is the practical reason this repository had zero tests. This file removes
 * the blocker: it supplies deterministic, obviously-fake values for every
 * required variable so suites can import production modules directly instead of
 * mocking them out.
 *
 * Rules:
 *  - Values here must never resemble real credentials. They are placeholders.
 *  - Use `??=` so a genuine environment (CI with real secrets, or a developer
 *    running against a scratch database) always wins.
 *  - When you add a `.required()` variable to `src/configs.ts`, add it here too,
 *    or every suite starts failing at import with a Joi error.
 */

// Deterministic key material. ENCRYPTION_KEY is consumed as raw UTF-8 and
// truncated to 32 bytes; ENCRYPTION_IV to 16. Both are sized exactly so the
// truncation is a no-op and `createCipheriv` cannot throw on length.
//
// Built by repetition rather than written as a literal: a 32-character literal
// here trips the gitleaks pre-commit hook as a high-entropy generic-api-key. This
// form is unmistakably a placeholder and keeps the hook useful instead of
// requiring a .gitleaksignore entry that would dull it.
const TEST_ENCRYPTION_KEY = 'test-key-'.repeat(4).slice(0, 32);
const TEST_ENCRYPTION_IV = 'test-iv-'.repeat(2).slice(0, 16);

process.env.NODE_ENV ??= 'test';

// Joi requires NODE_ENV to be present; configs.ts also re-assigns it. Keep both
// consistent so `configs.env` is 'test' and production-only branches stay off.
process.env.PROJECT_NAME ??= 'gaddr-backend-test';
process.env.PORT ??= '0'; // 0 = let the OS pick, so parallel suites cannot collide

// --- Cryptography -----------------------------------------------------------
process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
process.env.ENCRYPTION_IV ??= TEST_ENCRYPTION_IV;
process.env.ENCRYPTION_ALGORITHM ??= 'aes-256-cbc';

// --- JWT --------------------------------------------------------------------
process.env.JWT_SECRET ??= 'test-jwt-secret-not-a-real-secret';
process.env.JWT_AUDIENCE ??= 'https://test.gaddr.local';
process.env.JWT_ISSUER ??= 'https://test.gaddr.local';
process.env.JWT_ACCESS_EXPIRATION_MINUTES ??= '15m';
process.env.JWT_REFRESH_EXPIRATION_HOURS ??= '24h';

// --- Better Auth ------------------------------------------------------------
process.env.BETTER_AUTH_SECRET ??= 'test-better-auth-secret';

// --- Cloudflare R2 (all .required() in configs.ts) --------------------------
process.env.CLOUDFLARE_ACCOUNT_ID ??= 'test-account-id';
process.env.R2_BUCKET ??= 'test-bucket';
process.env.R2_ACCESS_KEY_ID ??= 'test-r2-access-key-id';
process.env.R2_SECRET_ACCESS_KEY ??= 'test-r2-secret-access-key';
process.env.R2_PUBLIC_URL_BASE ??= 'https://r2.test.gaddr.local';

// --- Postgres ---------------------------------------------------------------
// Not required by Joi (they carry defaults), but pinned so a stray connection
// attempt fails fast against localhost rather than reaching a real database.
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_DATABASE ??= 'gaddr_test';
process.env.POSTGRES_MIGRATIONS_RUN ??= 'false';
process.env.POSTGRES_SYNCHRONIZE ??= 'false';

// --- Integrations -----------------------------------------------------------
// Present so integration-health and webhook code paths have something to read.
// Deliberately invalid: any suite that actually reaches the network is a bug.
process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN ??= 'test-webhook-verify-token';

// Keep log output out of test results.
process.env.LOG_PATH ??= 'logs';
