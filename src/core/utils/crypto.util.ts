import * as crypto from 'crypto';
import configs from '../../configs';

// Extract and validate encryption settings
const algorithm = configs.encryption.algorithm; // should be 'aes-256-cbc'
const rawKey = Buffer.from(configs.encryption.key, 'utf-8');
const rawIV = Buffer.from(configs.encryption.iv, 'utf-8');

const key = rawKey.subarray(0, 32); // AES-256 needs 32-byte key
const iv = rawIV.subarray(0, 16); // CBC mode needs 16-byte IV

/* ==========================================================================
 * v2 — authenticated encryption (AES-256-GCM)
 *
 * Addresses finding C4. The legacy scheme below is AES-256-CBC with a single
 * process-wide IV read from the environment, which has three problems:
 *
 *   1. Deterministic — the same plaintext always produces the same ciphertext, so
 *      anyone with database read access learns which rows share a value.
 *   2. Unauthenticated — CBC ciphertext is malleable, and decryption failures form
 *      a padding oracle. The authenticated helpers further down existed but had
 *      zero production callers.
 *   3. Key material is raw UTF-8 truncated to 32 bytes, not derived.
 *
 * GCM fixes 1 and 2 outright: a fresh random IV per message, and an
 * authentication tag that makes tampering a clean failure rather than a
 * corrupted plaintext.
 *
 * Format: `v2:<base64 iv>:<base64 ciphertext>:<base64 authTag>`
 * The prefix is what makes dual-read possible — legacy values have none, so
 * `decrypt()` can route by inspection without a schema change or a backfill.
 * ========================================================================== */

const V2_PREFIX = 'v2:';
const GCM_ALGORITHM = 'aes-256-gcm';
/** 96 bits is the GCM-recommended IV length, and the fastest path in most implementations. */
const GCM_IV_BYTES = 12;

/**
 * Separate key for GCM, derived with HKDF rather than reusing the raw secret.
 *
 * Two reasons. Domain separation: the legacy key doubles as the HMAC key, so
 * deriving here keeps confidentiality and integrity material distinct. And
 * conditioning: `ENCRYPTION_KEY` is operator-supplied UTF-8 of unknown entropy, and
 * HKDF spreads whatever entropy exists across the full 32 bytes instead of trusting
 * the first 32 characters.
 *
 * Derived from the same environment secret on purpose — introducing a second
 * required variable would block this migration on an ops change, and the secret
 * needs rotating anyway (it was in the committed database dump).
 */
const gcmKey = Buffer.from(
  crypto.hkdfSync(
    'sha256',
    rawKey,
    Buffer.alloc(0), // no salt: the input is a long-lived secret, not a password
    'gaddr-aes-256-gcm-v2', // info label — the domain separator
    32,
  ),
);

/** Encrypt with AES-256-GCM. Use this for all new writes. */
function encryptV2(text: string): string {
  const messageIv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, gcmKey, messageIv);

  const ciphertext = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);

  return [
    'v2',
    messageIv.toString('base64'),
    ciphertext.toString('base64'),
    cipher.getAuthTag().toString('base64'),
  ].join(':');
}

/** Decrypt a v2 payload. Throws if the authentication tag does not verify. */
function decryptV2(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v2') {
    throw new Error('Malformed v2 ciphertext');
  }

  const [, ivB64, ciphertextB64, authTagB64] = parts;
  const decipher = crypto.createDecipheriv(
    GCM_ALGORITHM,
    gcmKey,
    Buffer.from(ivB64, 'base64'),
  );
  // Must be set before final(); final() is where verification happens and where a
  // tampered payload throws.
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Is this value in the v2 (authenticated) format? */
function isV2(value: string): boolean {
  return typeof value === 'string' && value.startsWith(V2_PREFIX);
}

/* ========================================================================== */

/**
 * Encrypt. Produces v2 (AES-256-GCM) output.
 *
 * The signature keeps the legacy `keyParam`/`ivParam` arguments so existing callers
 * compile unchanged, but supplying them now forces the legacy CBC path — they have
 * no meaning under GCM, where the IV is generated per message. No production caller
 * passes them.
 */
function encrypt(text: string, keyParam?: Buffer, ivParam?: Buffer): string {
  if (keyParam || ivParam) {
    return encryptLegacy(text, keyParam ?? key, ivParam ?? iv);
  }
  return encryptV2(text);
}

/** Legacy AES-256-CBC. Retained only for explicit callers and for round-trip tests. */
function encryptLegacy(
  text: string,
  keyParam: Buffer = key,
  ivParam: Buffer = iv,
): string {
  const cipher = crypto.createCipheriv(algorithm, keyParam, ivParam);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypt, routing by format.
 *
 * This is the dual-read half of the migration: v2 values decrypt with GCM, and
 * everything already in the database — hex CBC with no prefix — keeps working. No
 * backfill job is needed. OAuth tokens are re-encrypted as v2 whenever they are next
 * refreshed and rewritten, so legacy reads trend to zero on their own.
 *
 * When they reach zero, delete `encryptLegacy`, this branch, and `ENCRYPTION_IV`.
 */
function decrypt(
  encryptedText: string,
  keyParam?: Buffer,
  ivParam?: Buffer,
): string {
  if (isV2(encryptedText)) {
    return decryptV2(encryptedText);
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    keyParam ?? key,
    ivParam ?? iv,
  );
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Encrypt with HMAC (for integrity check)
function encryptWithHMAC(text: string): { encrypted: string; hmac: string } {
  const encryptedText = encrypt(text);
  const hmac = crypto
    .createHmac('sha256', key)
    .update(encryptedText)
    .digest('hex');
  return { encrypted: encryptedText, hmac };
}

// Verify HMAC
function verifyWithHMAC(encryptedText: string, hmac: string): boolean {
  const computedHMAC = crypto
    .createHmac('sha256', key)
    .update(encryptedText)
    .digest('hex');

  const expected = Buffer.from(computedHMAC, 'utf8');
  const actual = Buffer.from(hmac ?? '', 'utf8');

  // timingSafeEqual throws RangeError on length mismatch, which would surface as
  // an unhandled 500 (and an error oracle) rather than a clean rejection.
  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

// SHA-256 -> base64
function encodeSHA256ToBase64(text: string): string {
  return crypto.createHash('sha256').update(text).digest('base64');
}
//// SHA-256 -> base64url
function encodeSHA256ToBase64Url(text: string): string {
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
// Convert Buffer to base64url format
function generateEncryptionKeyBase64url(size: number = 32): string {
  return crypto
    .randomBytes(size)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// SHA-256 -> hex
function encodeSHA256ToHex(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Generate a random key of N bytes (default 32 = 256 bits)
function generateEncryptionKey(size: number = 32): string {
  return crypto.randomBytes(size).toString('hex');
}

// Export utility object
export const cryptoUtils = {
  algorithm,
  encrypt,
  decrypt,
  // Exposed for the migration and for tests. Prefer plain encrypt()/decrypt() in
  // application code — they already route correctly.
  encryptV2,
  decryptV2,
  encryptLegacy,
  isV2,
  encryptWithHMAC,
  verifyWithHMAC,
  encodeSHA256ToBase64,
  encodeSHA256ToHex,
  generateEncryptionKey,
  generateEncryptionKeyBase64url,
  encodeSHA256ToBase64Url,
};
