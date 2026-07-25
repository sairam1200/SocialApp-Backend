---
name: gaddr-encryption
description: Encryption, key management and the CBC-to-GCM migration for the Gaddr backend. Use when storing or reading OAuth tokens or any secret at rest, touching src/core/utils/crypto.util.ts, handling session tokens, or asked about encryption, key rotation, or data-at-rest protection.
---

# Gaddr encryption

## What is encrypted today, and how it is broken

`src/core/utils/crypto.util.ts` protects **social platform OAuth access and refresh
tokens** — the credentials that let Gaddr act on a user's behalf on YouTube,
Facebook, Pinterest and the rest. Losing them is worse than losing a password.

It has four defects (finding C4, still open):

1. **Process-wide static IV.** `ENCRYPTION_IV` comes from the environment and every
   `encrypt()` call reuses it. Encryption is therefore deterministic: identical
   plaintext always produces identical ciphertext. Anyone with database read
   access learns which rows share a value without decrypting anything.
2. **Unauthenticated cipher.** `aes-256-cbc` gives confidentiality only.
   Ciphertexts are malleable, and decryption failures form a padding oracle.
3. **The authenticated helpers are never called.** `encryptWithHMAC` and
   `verifyWithHMAC` exist with **zero production call sites**. The correct
   primitive was written and never wired up. All real callers use bare
   `encrypt`/`decrypt`.
4. **Key is truncated raw UTF-8, not derived.** `Buffer.from(key,'utf-8').subarray(0,32)`.
   A typed passphrase has far less than 256 bits of entropy, and a value under 32
   bytes yields a short buffer that makes `createCipheriv` throw at runtime rather
   than at boot.

Fixed already: `verifyWithHMAC` no longer throws `RangeError` on a
wrong-length HMAC (`timingSafeEqual` requires equal lengths). It returns `false`.

## Rules

- **Never add a new caller of bare `cryptoUtils.encrypt`/`decrypt`.** Use
  authenticated encryption for anything new.
- **Never store a session or API token in plaintext.** Store `sha256(token)` and
  compare hashes. Better Auth session tokens are currently plaintext in the
  `session` table (finding H2), which is why the committed database dump was so
  damaging.
- **Never reuse one key across primitives.** The AES key is currently also the
  HMAC key. Derive subkeys with HKDF and distinct `info` labels.
- **Keys come from Secret Manager**, never from build substitutions — Cloud Build
  substitutions appear in build logs.

## The CBC → GCM migration

Do not edit `encrypt()` in place. Ciphertext format is changing while live OAuth
tokens exist in the database, so it needs dual-read.

**Target format:** `aes-256-gcm`, fresh random 12-byte IV per message, stored as
`v2:<base64(iv)>:<base64(ciphertext)>:<base64(authTag)>`. The `v2:` prefix is what
makes dual-read possible — legacy values have no prefix.

**Steps:**

1. Require `ENCRYPTION_KEY` as 32 bytes supplied base64 or hex, and *decode* it.
   Validate length in `configs.ts` so a bad key fails at boot, not at first use.
2. Add `encryptV2()` / `decryptV2()` alongside the existing pair.
3. Make `decrypt()` a dispatcher: `v2:` prefix → GCM; otherwise → legacy CBC.
4. Point every writer at `encryptV2()`. Call sites:
   - `features/integrations/youtube/connect/youtube-connect.handler.ts`
   - `infrastructure/repositories/identity.repository.ts`
   - `infrastructure/services/publishing/oauth.service.ts`
   - `infrastructure/services/youtube/youtube-publishing.service.ts`
5. Re-encrypt lazily: OAuth tokens are refreshed regularly, so each refresh
   rewrites in v2 with no backfill job. Log the legacy-read count so you can see
   it trend to zero.
6. Once it reaches zero, delete the CBC path and rotate `ENCRYPTION_KEY`.

**Invert the documentation tests.** `crypto.util.spec.ts` asserts the current
weaknesses as executable documentation — e.g. "identical plaintext yields identical
ciphertext". When GCM lands those assertions must flip (`.not.toBe`). Failing
tests there are the intended signal, not a regression.

## Key rotation

`ENCRYPTION_KEY` is compromised: the committed database dump included
`public."dataProtectionKeys"` (34 rows). Rotation is outstanding and cannot be done
from code — it needs production database access.

Rotation shape: add `ENCRYPTION_KEY_PREVIOUS`, try the current key first and fall
back to the previous on decrypt failure, re-encrypt on read, then drop the previous
key once the legacy count is zero. Same dual-read discipline as above.

## Verify

```bash
npx jest src/core/utils/crypto.util.spec.ts
```

23 tests cover round-trips (including Swedish, Arabic and CJK payloads), the
`timingSafeEqual` regression, and the documented weaknesses.
