import * as crypto from 'crypto';
import { cryptoUtils } from './crypto.util';

/**
 * Tests for the encryption utility, including the fix for the
 * `timingSafeEqual` crash in finding C4 of
 * docs/audit/2026-07_Security_And_Correctness_Audit.md.
 *
 * The remaining C4 problems (a process-wide static IV, and unauthenticated CBC)
 * are DOCUMENTED here as executable assertions rather than silently tolerated,
 * because fixing them changes the stored ciphertext format for live OAuth tokens
 * and needs a dual-read migration. When that migration lands, the tests marked
 * "DOCUMENTS finding C4" must be inverted — that is the intended signal.
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

  describe('DOCUMENTS finding C4 — known weaknesses, not yet fixed', () => {
    it('is deterministic: identical plaintext yields identical ciphertext', () => {
      // Because the IV is process-wide and constant, encryption leaks equality.
      // Anyone with database read access can tell which rows share a value
      // without decrypting anything.
      //
      // When AES-GCM with per-message IVs lands, this must become
      // `expect(first).not.toBe(second)`.
      const first = cryptoUtils.encrypt('same-token-value');
      const second = cryptoUtils.encrypt('same-token-value');

      expect(first).toBe(second);
    });

    it('uses an unauthenticated cipher, so ciphertext is malleable', () => {
      // aes-256-cbc provides confidentiality only. The authenticated helpers
      // (encryptWithHMAC/verifyWithHMAC) exist but no production call site uses
      // them — all OAuth token storage calls bare encrypt()/decrypt().
      expect(cryptoUtils.algorithm).toBe('aes-256-cbc');
      expect(cryptoUtils.algorithm).not.toMatch(
        /gcm|ccm|ocb|chacha20-poly1305/,
      );
    });

    it('derives the key by truncating raw UTF-8 rather than via a KDF', () => {
      // Entropy equals whatever the operator typed, not 256 bits. A value shorter
      // than 32 bytes yields a short buffer and createCipheriv throws at runtime
      // rather than at boot.
      expect(cryptoUtils.key).toHaveLength(32);
      expect(cryptoUtils.iv).toHaveLength(16);
      expect(
        cryptoUtils.key.equals(
          Buffer.from(process.env.ENCRYPTION_KEY!.slice(0, 32), 'utf-8'),
        ),
      ).toBe(true);
    });

    it('reuses the same key for encryption and for the HMAC', () => {
      // No domain separation between confidentiality and integrity keys.
      const { encrypted, hmac } = cryptoUtils.encryptWithHMAC('payload');
      const recomputedWithEncryptionKey = crypto
        .createHmac('sha256', cryptoUtils.key)
        .update(encrypted)
        .digest('hex');

      expect(hmac).toBe(recomputedWithEncryptionKey);
    });
  });
});
