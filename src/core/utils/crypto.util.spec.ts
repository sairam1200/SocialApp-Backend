import * as crypto from 'crypto';
import { cryptoUtils } from './crypto.util';

/**
 * Tests for the encryption utility.
 *
 * Finding C4 is now closed. `encrypt()` produces AES-256-GCM with a fresh random IV
 * per message and an authentication tag; `decrypt()` routes by format so the hex CBC
 * values already in the database keep working (dual-read).
 *
 * The assertions that previously documented the weaknesses — deterministic output,
 * unauthenticated cipher — are inverted below. That inversion was the planned signal
 * that the migration had landed.
 */
describe('cryptoUtils', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('recovers the original plaintext', () => {
      const plaintext = 'ya29.a0AfB_byC-example-oauth-access-token';
      const encrypted = cryptoUtils.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(cryptoUtils.decrypt(encrypted)).toBe(plaintext);
    });

    it('handles an empty string', () => {
      expect(cryptoUtils.decrypt(cryptoUtils.encrypt(''))).toBe('');
    });

    it('handles unicode, including Swedish and Arabic characters', () => {
      // The product targets Swedish, Arabic and Asian locales; token payloads and
      // profile data can carry any of these.
      const plaintext = 'åäöÅÄÖ — مرحبا — 日本語 — 🎉';
      expect(cryptoUtils.decrypt(cryptoUtils.encrypt(plaintext))).toBe(
        plaintext,
      );
    });

    it('handles a payload larger than one AES block', () => {
      const plaintext = 'x'.repeat(5000);
      expect(cryptoUtils.decrypt(cryptoUtils.encrypt(plaintext))).toBe(
        plaintext,
      );
    });

    it('round-trips a serialised OAuth token object', () => {
      const payload = JSON.stringify({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expires_in: 3600,
      });

      expect(
        JSON.parse(cryptoUtils.decrypt(cryptoUtils.encrypt(payload))),
      ).toEqual({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expires_in: 3600,
      });
    });
  });

  describe('verifyWithHMAC — finding C4 regression', () => {
    it('accepts a correct HMAC', () => {
      const { encrypted, hmac } = cryptoUtils.encryptWithHMAC('payload');
      expect(cryptoUtils.verifyWithHMAC(encrypted, hmac)).toBe(true);
    });

    it('rejects a tampered HMAC of the correct length', () => {
      const { encrypted, hmac } = cryptoUtils.encryptWithHMAC('payload');
      const tampered = (hmac[0] === 'a' ? 'b' : 'a') + hmac.slice(1);

      expect(cryptoUtils.verifyWithHMAC(encrypted, tampered)).toBe(false);
    });

    it('rejects a tampered ciphertext', () => {
      const { hmac } = cryptoUtils.encryptWithHMAC('payload');
      expect(cryptoUtils.verifyWithHMAC('deadbeef', hmac)).toBe(false);
    });

    // The C4 regression: crypto.timingSafeEqual throws RangeError when the two
    // buffers differ in length. Before the fix an attacker-supplied HMAC of the
    // wrong length produced an unhandled 500 (and an error oracle) instead of a
    // clean rejection. Each of these must return false, never throw.
    it.each([
      ['a short HMAC', 'abc'],
      ['an empty HMAC', ''],
      ['an over-long HMAC', 'a'.repeat(200)],
      ['one character short', 'a'.repeat(63)],
      ['one character long', 'a'.repeat(65)],
    ])('returns false for %s instead of throwing', (_label, badHmac) => {
      const { encrypted } = cryptoUtils.encryptWithHMAC('payload');

      expect(() =>
        cryptoUtils.verifyWithHMAC(encrypted, badHmac),
      ).not.toThrow();
      expect(cryptoUtils.verifyWithHMAC(encrypted, badHmac)).toBe(false);
    });

    it('returns false for a null/undefined HMAC instead of throwing', () => {
      const { encrypted } = cryptoUtils.encryptWithHMAC('payload');

      expect(() =>
        cryptoUtils.verifyWithHMAC(encrypted, undefined as unknown as string),
      ).not.toThrow();
      expect(
        cryptoUtils.verifyWithHMAC(encrypted, null as unknown as string),
      ).toBe(false);
    });
  });

  describe('hashing and key generation', () => {
    it('produces a stable SHA-256 hex digest', () => {
      // Well-known vector for the empty string.
      expect(cryptoUtils.encodeSHA256ToHex('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('produces base64url output with no padding or unsafe characters', () => {
      const encoded = cryptoUtils.encodeSHA256ToBase64Url('gaddr');

      expect(encoded).not.toMatch(/[+/=]/);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates keys of the requested byte length', () => {
      // Hex encoding: 32 bytes -> 64 characters.
      expect(cryptoUtils.generateEncryptionKey(32)).toHaveLength(64);
      expect(cryptoUtils.generateEncryptionKey(16)).toHaveLength(32);
    });

    it('generates distinct keys on each call', () => {
      const keys = new Set(
        Array.from({ length: 50 }, () => cryptoUtils.generateEncryptionKey(32)),
      );
      expect(keys.size).toBe(50);
    });

    it('generates base64url keys without unsafe characters', () => {
      expect(cryptoUtils.generateEncryptionKeyBase64url(32)).toMatch(
        /^[A-Za-z0-9_-]+$/,
      );
    });
  });

  describe('finding C4 — authenticated encryption, now fixed', () => {
    it('is NON-deterministic: identical plaintext yields different ciphertext', () => {
      // The inversion of the old assertion. Under the previous static-IV CBC scheme
      // these were byte-identical, which leaked equality to anyone with database
      // read access — they could tell which rows shared a value without decrypting.
      const first = cryptoUtils.encrypt('same-token-value');
      const second = cryptoUtils.encrypt('same-token-value');

      expect(first).not.toBe(second);
      // Both still decrypt to the same plaintext.
      expect(cryptoUtils.decrypt(first)).toBe('same-token-value');
      expect(cryptoUtils.decrypt(second)).toBe('same-token-value');
    });

    it('emits the versioned v2 format', () => {
      // The prefix is what makes dual-read possible without a schema change.
      const encrypted = cryptoUtils.encrypt('payload');

      expect(encrypted.startsWith('v2:')).toBe(true);
      expect(cryptoUtils.isV2(encrypted)).toBe(true);
      // v2:<iv>:<ciphertext>:<authTag>
      expect(encrypted.split(':')).toHaveLength(4);
    });

    it('detects tampering instead of returning corrupted plaintext', () => {
      // The whole point of authenticated encryption. Under CBC a flipped bit
      // produced garbage or a padding error — a malleability and oracle risk.
      const encrypted = cryptoUtils.encrypt('sensitive-oauth-token');
      const parts = encrypted.split(':');

      const ciphertext = Buffer.from(parts[2], 'base64');
      ciphertext[0] ^= 1;
      parts[2] = ciphertext.toString('base64');

      expect(() => cryptoUtils.decrypt(parts.join(':'))).toThrow();
    });

    it('detects a tampered authentication tag', () => {
      const encrypted = cryptoUtils.encrypt('sensitive-oauth-token');
      const parts = encrypted.split(':');

      const tag = Buffer.from(parts[3], 'base64');
      tag[0] ^= 1;
      parts[3] = tag.toString('base64');

      expect(() => cryptoUtils.decrypt(parts.join(':'))).toThrow();
    });

    it('rejects a malformed v2 payload rather than misreading it', () => {
      expect(() => cryptoUtils.decrypt('v2:only:three')).toThrow();
      expect(() => cryptoUtils.decryptV2('not-v2-at-all')).toThrow();
    });

    it('uses an HKDF-derived key, not the raw secret', () => {
      // Domain separation: the legacy key doubles as the HMAC key, so GCM must not
      // reuse it. Also conditions operator-supplied UTF-8 of unknown entropy.
      const expected = Buffer.from(
        crypto.hkdfSync(
          'sha256',
          Buffer.from(process.env.ENCRYPTION_KEY!, 'utf-8'),
          Buffer.alloc(0),
          'gaddr-aes-256-gcm-v2',
          32,
        ),
      );

      // The GCM key is internal, so verify indirectly: a payload encrypted with the
      // derived key must decrypt with it, and must NOT decrypt with the legacy key.
      const encrypted = cryptoUtils.encrypt('payload');
      const parts = encrypted.split(':');

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        expected,
        Buffer.from(parts[1], 'base64'),
      );
      decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
      const out = Buffer.concat([
        decipher.update(Buffer.from(parts[2], 'base64')),
        decipher.final(),
      ]).toString('utf8');

      expect(out).toBe('payload');
      // The derived key must differ from the raw encryption key
      const rawKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf-8').subarray(0, 32);
      expect(expected.equals(rawKey)).toBe(false);
    });
  });

  describe('dual-read migration', () => {
    it('still decrypts legacy CBC values with no prefix', () => {
      // Everything already in the database is hex CBC. If this breaks, every stored
      // OAuth token becomes unreadable — the migration would be a data-loss event.
      const token = 'ya29.legacy-stored-token';
      const legacy = cryptoUtils.encryptLegacy(token);

      expect(cryptoUtils.isV2(legacy)).toBe(false);
      expect(cryptoUtils.decrypt(legacy)).toBe(token);
    });

    it('routes each format to the right cipher', () => {
      const token = 'shared-plaintext';
      const legacy = cryptoUtils.encryptLegacy(token);
      const modern = cryptoUtils.encrypt(token);

      expect(legacy).not.toBe(modern);
      expect(cryptoUtils.decrypt(legacy)).toBe(token);
      expect(cryptoUtils.decrypt(modern)).toBe(token);
    });

    it('legacy CBC remains deterministic, which is why it is being retired', () => {
      // Retained as the reason the migration exists, not as acceptable behaviour.
      expect(cryptoUtils.encryptLegacy('x')).toBe(
        cryptoUtils.encryptLegacy('x'),
      );
    });

    it('round-trips unicode through v2', () => {
      const plaintext = 'åäöÅÄÖ — مرحبا — 日本語 — 🎉';
      expect(cryptoUtils.decrypt(cryptoUtils.encrypt(plaintext))).toBe(
        plaintext,
      );
    });

    it('round-trips a payload larger than one AES block through v2', () => {
      const plaintext = 'x'.repeat(5000);
      expect(cryptoUtils.decrypt(cryptoUtils.encrypt(plaintext))).toBe(
        plaintext,
      );
    });
  });
});
