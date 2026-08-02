/**
 * Allowed cross-origin origins, split by environment.
 *
 * CORS is enabled with `credentials: true`, so every entry here may send
 * authenticated requests on a user's behalf. Two classes of origin must never
 * reach production:
 *
 *  - Free-tier tunnel hostnames (ngrok and similar) are *reassignable* — whoever
 *    claims the name next inherits credentialed access to production.
 *  - Preview/staging deployments have weaker access control than production.
 *
 * Add production origins deliberately; keep development origins in the
 * development list only.
 */

const PRODUCTION_ORIGINS = [
  'https://gaddr.com',
  'https://www.gaddr.com',
  'https://demo.gaddr.com',
  'https://jobs.gaddr.com',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:5173',
  // Reassignable tunnel + preview deployment — development only, never production.
  'https://almost-backtrack-drapery.ngrok-free.dev',
  'https://social-app-zeta-three.vercel.app',
];

export const CORS_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];
