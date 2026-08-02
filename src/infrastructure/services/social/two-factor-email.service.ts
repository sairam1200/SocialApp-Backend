import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { cryptoUtils } from '../../../core/utils/crypto.util';
import redis from '../../../core/utils/redis.util';
import logger from '../../../core/utils/winston.util';
import { User } from '../../../domain/entities';
import { BrandedEmailService } from './branded-email.service';

/** Digits only — this gets typed on a phone keyboard. */
const numericCode = customAlphabet('0123456789', 6);

const CODE_TTL_SECONDS = 10 * 60;
/** Wrong guesses before the code is burned. 6 digits × 5 tries is 1 in 200 000. */
const MAX_ATTEMPTS = 5;
/** Minimum gap between sends, so "resend" cannot be used to spam an inbox. */
const RESEND_COOLDOWN_SECONDS = 45;

interface StoredChallenge {
  /** SHA-256 of the code. The plaintext is never stored, not even in Redis. */
  hash: string;
  attempts: number;
  issuedAt: number;
}

/**
 * The email second factor.
 *
 * Codes live in Redis with a TTL, hashed, with an attempt counter. Nothing is
 * persisted to Postgres: a one-time code that outlives its window is a
 * liability, and Redis expiring it is more reliable than a cleanup job.
 *
 * Redis is optional at boot in this service (`main.ts` continues without it),
 * so every path here degrades explicitly. If Redis is unavailable the
 * challenge cannot be stored, and `issueAsync` says so rather than sending a
 * code that could never be verified.
 */
@Injectable()
export class TwoFactorEmailService {
  constructor(private readonly email: BrandedEmailService) {}

  private key(userId: string): string {
    return redis.getRedisKey('auth:2fa:email', userId);
  }

  private cooldownKey(userId: string): string {
    return redis.getRedisKey('auth:2fa:email:cooldown', userId);
  }

  /**
   * Issue a code and email it.
   *
   * Returns `sent: false` with a reason rather than throwing, so the login
   * flow can tell the user something useful instead of a 500.
   */
  public async issueAsync(
    user: User,
    context?: { device?: string },
  ): Promise<{ sent: boolean; reason?: 'cooldown' | 'unavailable' }> {
    if (!user.email) return { sent: false, reason: 'unavailable' };

    try {
      const cooldown = await redis.getFromRedisAsync<{ at: number }>(
        this.cooldownKey(user.id),
      );
      if (cooldown) return { sent: false, reason: 'cooldown' };

      const code = numericCode();
      const challenge: StoredChallenge = {
        hash: cryptoUtils.encodeSHA256ToHex(code),
        attempts: 0,
        issuedAt: Date.now(),
      };

      const stored = await redis.storeInRedisAsync(
        this.key(user.id),
        challenge,
        CODE_TTL_SECONDS,
      );
      if (!stored) return { sent: false, reason: 'unavailable' };

      await redis.storeInRedisAsync(
        this.cooldownKey(user.id),
        { at: Date.now() },
        RESEND_COOLDOWN_SECONDS,
      );

      await this.email.sendTwoFactorCodeAsync({
        to: user.email,
        code,
        expiresInMinutes: CODE_TTL_SECONDS / 60,
        device: context?.device,
      });
      return { sent: true };
    } catch (error) {
      logger.error('[2fa-email] failed to issue a code', error);
      return { sent: false, reason: 'unavailable' };
    }
  }

  /**
   * Verify a submitted code.
   *
   * Constant-time comparison on the hashes, an attempt counter that burns the
   * challenge, and single use — a verified code is deleted before this
   * returns, so it cannot be replayed even within its TTL.
   */
  public async verifyAsync(
    userId: string,
    submitted: string,
  ): Promise<{
    valid: boolean;
    reason?: 'expired' | 'exhausted' | 'mismatch';
  }> {
    const key = this.key(userId);

    let challenge: StoredChallenge | null = null;
    try {
      challenge = await redis.getFromRedisAsync<StoredChallenge>(key);
    } catch (error) {
      logger.error('[2fa-email] challenge lookup failed', error);
      return { valid: false, reason: 'expired' };
    }

    if (!challenge) return { valid: false, reason: 'expired' };
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await redis.removeFromRedisAsync(key);
      return { valid: false, reason: 'exhausted' };
    }

    const submittedHash = cryptoUtils.encodeSHA256ToHex(
      (submitted ?? '').trim(),
    );
    if (!timingSafeEqual(submittedHash, challenge.hash)) {
      await redis.storeInRedisAsync(
        key,
        { ...challenge, attempts: challenge.attempts + 1 },
        // Preserve the original window. Refreshing the TTL on every wrong
        // guess would let an attacker keep a challenge alive indefinitely.
        Math.max(
          1,
          Math.ceil(
            (challenge.issuedAt + CODE_TTL_SECONDS * 1000 - Date.now()) / 1000,
          ),
        ),
      );
      return { valid: false, reason: 'mismatch' };
    }

    await redis.removeFromRedisAsync(key);
    await redis.removeFromRedisAsync(this.cooldownKey(userId));
    return { valid: true };
  }

  /** Discard any outstanding challenge — used when 2FA is turned off. */
  public async clearAsync(userId: string): Promise<void> {
    await Promise.all([
      redis.removeFromRedisAsync(this.key(userId)),
      redis.removeFromRedisAsync(this.cooldownKey(userId)),
    ]);
  }
}

/**
 * Length-independent constant-time string comparison.
 *
 * Both inputs here are fixed-length hex digests, so the length check leaks
 * nothing; the loop keeps the comparison itself from short-circuiting on the
 * first differing character.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}
