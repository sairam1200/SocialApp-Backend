import * as dns from 'dns';
import { Injectable } from '@nestjs/common';
import {
  IEmailValidationService,
  EmailValidationResult,
} from '../../domain/services/iemail-validation.service';
import logger from '../../core/utils/winston.util';

const TRUSTED_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'yahoo.com',
  'ymail.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'zoho.com',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'email.com',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

interface CacheEntry {
  result: { valid: boolean; method: string };
  expiresAt: number;
}

@Injectable()
export class EmailValidationService implements IEmailValidationService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly CACHE_MAX_SIZE = 1000;
  private readonly DNS_TIMEOUT_MS = 5000;

  validate(email: string): Promise<EmailValidationResult> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return Promise.resolve({ valid: false, error: 'Invalid email format' });
    }

    if (TRUSTED_PROVIDERS.has(domain)) {
      return Promise.resolve({ valid: true, mxMethod: 'trusted' });
    }

    const suggestion = this.detectTypo(email);
    if (suggestion) {
      return Promise.resolve({
        valid: false,
        error: `Did you mean ${suggestion}?`,
        suggestion,
      });
    }

    return this.validateMx(domain);
  }

  private detectTypo(email: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || TRUSTED_PROVIDERS.has(domain)) {
      return null;
    }

    const local = email.split('@')[0];
    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const provider of TRUSTED_PROVIDERS) {
      const d = levenshtein(domain, provider);
      if (d <= 2 && d < bestDistance) {
        bestDistance = d;
        bestMatch = provider;
      }
    }

    if (bestMatch) {
      return `${local}@${bestMatch}`;
    }
    return null;
  }

  private async validateMx(
    domain: string,
  ): Promise<EmailValidationResult> {
    const cached = this.getCached(domain);
    if (cached) {
      if (!cached.result.valid) {
        return {
          valid: false,
          error: 'Email domain does not exist or cannot receive email',
          mxMethod: cached.result.method as EmailValidationResult['mxMethod'],
        };
      }
      return {
        valid: true,
        mxMethod: cached.result.method as EmailValidationResult['mxMethod'],
      };
    }

    const mxResult = await this.resolveMxWithTimeout(domain);
    this.setCache(domain, mxResult);

    if (!mxResult.valid) {
      return {
        valid: false,
        error: 'Email domain does not exist or cannot receive email',
        mxMethod: mxResult.method,
      };
    }

    return { valid: true, mxMethod: mxResult.method };
  }

  private async resolveMxWithTimeout(
    domain: string,
  ): Promise<{ valid: boolean; method: EmailValidationResult['mxMethod'] }> {
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), this.DNS_TIMEOUT_MS),
    );

    const result = await Promise.race([
      this.resolveMxWithFallback(domain),
      timeout,
    ]);

    if (result === 'timeout') {
      logger.warn(`DNS lookup timed out for domain: ${domain}`);
      return { valid: true, method: 'timeout' };
    }

    return result;
  }

  private async resolveMxWithFallback(
    domain: string,
  ): Promise<{ valid: boolean; method: EmailValidationResult['mxMethod'] }> {
    try {
      const mx = await dns.promises.resolveMx(domain);
      if (mx && mx.length > 0) {
        return { valid: true, method: 'mx' };
      }
    } catch {}

    try {
      const a = await dns.promises.resolve4(domain);
      if (a && a.length > 0) {
        return { valid: true, method: 'a' };
      }
    } catch {}

    try {
      const aaaa = await dns.promises.resolve6(domain);
      if (aaaa && aaaa.length > 0) {
        return { valid: true, method: 'aaaa' };
      }
    } catch {}

    return { valid: false, method: 'none' };
  }

  private getCached(domain: string): CacheEntry | undefined {
    const entry = this.cache.get(domain);
    if (entry && entry.expiresAt > Date.now()) {
      return entry;
    }
    this.cache.delete(domain);
    return undefined;
  }

  private setCache(
    domain: string,
    result: { valid: boolean; method: string },
  ): void {
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(domain, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }
}
