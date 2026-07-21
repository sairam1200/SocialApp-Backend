import configs from '../../configs';

export const betterAuthConfig = {
  secret: configs.betterAuth.secret,
  sessionCookieName: configs.betterAuth.sessionCookieName,
  secureCookiePrefix: configs.env === 'production' ? '__Secure-' : undefined,
} as const;
