import * as crypto from 'crypto';
import configs from '../../configs';

// Extract and validate encryption settings
const algorithm = configs.encryption.algorithm; // should be 'aes-256-cbc'
const rawKey = Buffer.from(configs.encryption.key, 'utf-8');
const rawIV = Buffer.from(configs.encryption.iv, 'utf-8');

const key = rawKey.subarray(0, 32); // AES-256 needs 32-byte key
const iv = rawIV.subarray(0, 16); // CBC mode needs 16-byte IV

// Encrypt using AES-256-CBC
function encrypt(
  text: string,
  keyParam: Buffer = key,
  ivParam: Buffer = iv,
): string {
  const cipher = crypto.createCipheriv(algorithm, keyParam, ivParam);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// Decrypt using AES-256-CBC
function decrypt(
  encryptedText: string,
  keyParam: Buffer = key,
  ivParam: Buffer = iv,
): string {
  const decipher = crypto.createDecipheriv(algorithm, keyParam, ivParam);
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
  return crypto.timingSafeEqual(
    Buffer.from(computedHMAC, 'utf8'),
    Buffer.from(hmac, 'utf8'),
  );
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
  key,
  iv,
  encrypt,
  decrypt,
  encryptWithHMAC,
  verifyWithHMAC,
  encodeSHA256ToBase64,
  encodeSHA256ToHex,
  generateEncryptionKey,
  generateEncryptionKeyBase64url,
  encodeSHA256ToBase64Url,
};
