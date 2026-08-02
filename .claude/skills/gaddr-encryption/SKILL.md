---
name: gaddr-encryption
description: Encryption, key management and the CBC-to-GCM migration for the Gaddr backend. Use when storing or reading OAuth tokens or any secret at rest, touching src/core/utils/crypto.util.ts, handling session tokens, or asked about encryption, key rotation, or data-at-rest protection.
when_to_use: Trigger phrases include "encrypt", "decrypt", "cryptoUtils", "AES", "GCM", "CBC", "static IV", "ENCRYPTION_KEY", "key rotation", "hash the token", "store this secret", "store an OAuth token", "refresh token at rest", "Secret Manager", and any edit to src/core/utils/crypto.util.ts or to a handler that persists a platform access or refresh token.
---

# Gaddr encryption

## Current state — finding C4 is CLOSED

`src/core/utils/crypto.util.ts` protects **social platform OAuth access and refresh
tokens** — the credentials that let Gaddr act on a user's behalf on YouTube,
Facebook, Pinterest and the rest. Losing them is worse than losing a password.

`encrypt()` now produces **AES-256-GCM** with a fresh random 12-byte IV per message
and an authentication tag:

```
v2:<base64 iv>:<base64 ciphertext>:<base64 authTag>
```

`decrypt()` routes by format, so hex CBC values already in the database keep working.
That is the dual-read half of the migration — no backfill job, and legacy reads trend
to zero as tokens are refreshed and rewritten.

The GCM key is **HKDF-derived** (`info: 'gaddr-aes-256-gcm-v2'`) from the same
`ENCRYPTION_KEY` material. Two reasons: domain separation, because the legacy key also
serves as the HMAC key; and conditioning, because the env value is operator-supplied
UTF-8 of unknown entropy and HKDF spreads what entropy exists across all 32 bytes
rather than trusting the first 32 characters.

What this fixed, versus the old static-IV CBC scheme:

| Was | Now |
|---|---|
| Deterministic — identical plaintext gave identical ciphertext, leaking equality to anyone with DB read access | Non-deterministic; verified by test |
| Unauthenticated — malleable ciphertext, padding-oracle risk | Tampering throws on the auth tag; verified for both ciphertext and tag |
| Key = raw UTF-8 truncated to 32 bytes | HKDF-derived, domain-separated |
| `verifyWithHMAC` threw `RangeError` on a wrong-length HMAC | Returns `false` |

### What is still outstanding

- **`ENCRYPTION_KEY` must be rotated.** It was in the committed database dump
  (`dataProtectionKeys`, 34 rows). Needs production access — not doable from code.
- **Legacy CBC removal.** Keep the branch until legacy reads reach zero, then delete
  `encryptLegacy`, the fallback in `decrypt()`, and `ENCRYPTION_IV`.
- **Better Auth session tokens are still plaintext** in the `session` table
  (finding H2). Store `sha256(token)` and compare hashes.

## Rules

- **`cryptoUtils.encrypt` is now the correct call.** It emits authenticated GCM, so
  new callers are fine — this reverses the earlier rule, which existed only while
  `encrypt` was bare CBC.
- **Never pass `keyParam`/`ivParam`.** They survive for signature compatibility and
  **force the legacy CBC path**. They are meaningless under GCM, where the IV is
  per-message. No production caller passes them.
- **Never delete the legacy branch in `decrypt()`** until stored tokens have been
  rewritten. Every OAuth token in the database today is hex CBC; removing the fallback
  makes them unreadable. That is a data-loss event, not a cleanup.
- **Never store a session or API token in plaintext.** Store `sha256(token)` and
  compare hashes. Better Auth session tokens are still plaintext in the `session`
  table (finding H2), which is why the committed database dump was so damaging.
- **Never reuse one key across primitives.** The GCM key is HKDF-derived with the
  `gaddr-aes-256-gcm-v2` info label, so it is separated. The **HMAC key is still the
  raw AES key** — derive it the same way before adding any new HMAC use.
- **Keys come from Secret Manager**, never from build substitutions — Cloud Build
  substitutions appear in build logs.

## How the dual-read migration works

Existing writers needed no change: they call `cryptoUtils.encrypt`, which now emits
v2. Those call sites are

- `features/integrations/youtube/connect/youtube-connect.handler.ts`
- `infrastructure/repositories/identity.repository.ts`
- `infrastructure/services/publishing/oauth.service.ts`
- `infrastructure/services/youtube/youtube-publishing.service.ts`

`encrypt()` keeps its old `keyParam`/`ivParam` arguments for signature compatibility,
but **passing either forces the legacy CBC path** — they are meaningless under GCM,
where the IV is per-message. No production caller passes them; `encryptLegacy` is
explicit for the tests that still need CBC output.

The one thing to be careful about: **do not remove the legacy branch in `decrypt()`
prematurely.** Every OAuth token currently stored is hex CBC. Removing the fallback
before those are rewritten makes them all unreadable, which is a data-loss event, not
a cleanup. `crypto.util.spec.ts` pins this with a dual-read test.

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

30 tests: GCM round-trips (including Swedish, Arabic and CJK payloads and >1 block),
non-determinism, tamper detection on both ciphertext and auth tag, malformed-payload
rejection, HKDF key derivation, the `timingSafeEqual` regression, and the dual-read
path that keeps legacy CBC values readable.
