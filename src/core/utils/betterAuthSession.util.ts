import { Request } from 'express';
import { betterAuthConfig } from '../config/betterAuth.config';

export function extractBetterAuthToken(req: Request): string | null {
  const names = [
    betterAuthConfig.sessionCookieName,
    ...(betterAuthConfig.secureCookiePrefix
      ? [
          `${betterAuthConfig.secureCookiePrefix}${betterAuthConfig.sessionCookieName}`,
        ]
      : []),
  ];

  for (const name of names) {
    const value = req.cookies?.[name];
    if (value) {
      const dotIndex = value.indexOf('.');
      if (dotIndex > 0) {
        return value.substring(0, dotIndex);
      }
      return value;
    }
  }

  return null;
}
