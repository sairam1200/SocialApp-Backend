import configs from './configs';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import redis from './core/utils/redis.util';
import logger from './core/utils/winston.util';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './modules/app.module';
import dataSource from './infrastructure/persistence/data.source';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  addScalarApiDocs,
  addSwaggerApiDocs,
  addWebSocketDocs,
} from './core/utils/apiDocs.util';
import { ErrorHandlersFilter } from './core/exceptions/exceptionHandler.filter';
import { ApiDocRedirectMiddleware } from './core/middlewares/apiDocRedirect.middleware';
import { CORS_ORIGINS } from './core/configs/cors.config';
import cookieParser = require('cookie-parser');

console.info(
  `[startup] main.ts loaded — PID ${process.pid}, NODE_ENV=${process.env.NODE_ENV}, K_SERVICE=${process.env.K_SERVICE || 'none'}`,
);

process.on('unhandledRejection', (reason) => {
  console.error(`[startup] Unhandled Promise Rejection: ${reason}`);
  logger.error(`Unhandled Promise Rejection: ${reason}`);
});

process.on('uncaughtException', (reason) => {
  console.error(`[startup] Uncaught Exception: ${reason}`);
  logger.error(`Uncaught Exception: ${reason}`);
  process.exit(1);
});

async function bootstrap() {
  console.info('[startup] bootstrap() called');

  try {
    await redis.connectToRedis();
    console.info('[startup] Redis connected');
  } catch (redisErr) {
    const msg = redisErr instanceof Error ? redisErr.message : redisErr;
    console.warn(
      `[startup] Redis unavailable (${msg}). Continuing without Redis.`,
    );
    logger.warn(`Redis unavailable (${msg}). Continuing without Redis.`);
  }

  console.info('[startup] STEP 1 — creating NestFactory');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.info('[startup] STEP 2 — NestFactory created');

  app.enableShutdownHooks();

  // Cloud Run / Vercel terminate TLS and forward the client address in
  // X-Forwarded-For. Without this, req.ip is the proxy's address, so anything
  // keyed on client IP (rate limiting, audit logs, geo lookup) is keyed on the
  // wrong identity — collapsing all callers into a single bucket.
  // Trust exactly one hop: the platform load balancer, which overwrites the
  // header. A larger value would let clients spoof their own address.
  app.set('trust proxy', 1);

  // Security headers. Finding M-series in the audit: none of these were set, and their
  // absence is specifically what made the frontend's localStorage token storage exploitable —
  // without a CSP, any injected script can read it and post it anywhere.
  //
  // Configured for an **API**, not a website. The researched guidance for a JSON service is to
  // start from a deny-all policy and add only what is needed, rather than trimming the
  // browser-oriented defaults down:
  //
  // - `default-src 'none'` — this service returns JSON. It has no scripts, styles, fonts or
  //   frames of its own to allow, so nothing needs to be permitted by default.
  // - CSP is **skipped outside production**, because Swagger and Scalar are mounted there and
  //   both need inline scripts and styles to render. Loosening the production policy to suit a
  //   dev-only tool would be the wrong trade; in production those routes do not exist.
  // - `crossOriginResourcePolicy: false` — the frontend is a different origin, and the default
  //   `same-origin` would block it from reading responses. CORS above is what governs that,
  //   deliberately and explicitly.
  // - HSTS with a two-year max-age and `includeSubDomains`, since gaddr.com is HTTPS-only
  //   behind Cloud Run. `preload` is left off on purpose: submitting to the browser preload
  //   list is effectively irreversible, and that is a decision for whoever owns the domain.
  app.use(
    helmet({
      contentSecurityPolicy:
        configs.env === 'production'
          ? {
              // `useDefaults: false` is the whole point. Helmet merges directives into its
              // browser-oriented defaults unless told not to, so the first version of this
              // emitted `default-src 'none'` *alongside* `script-src 'self'`,
              // `font-src 'self' https: data:` and `style-src 'unsafe-inline'` — a deny-all
              // with a list of holes punched in it for content a JSON API does not serve.
              // Verified by reading the emitted header rather than assuming.
              useDefaults: false,
              directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
                formAction: ["'none'"],
              },
            }
          : false,
      // DENY, not the SAMEORIGIN default. Nothing here should ever be framed, including by
      // us — there is no page to frame.
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: false,
      // Referrer is meaningless for an API and can leak a path to a third party.
      referrerPolicy: { policy: 'no-referrer' },
      hsts: {
        maxAge: 63_072_000,
        includeSubDomains: true,
        preload: false,
      },
    }),
  );

  app.use(cookieParser());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  if (configs.env !== 'production') {
    addSwaggerApiDocs(app);
    addScalarApiDocs(app);
    addWebSocketDocs(app);
  }

  app.enableCors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-turnstile-token',
      'x-client-origin',
      'x-redirect-url',
      'x-chunk-index',
      'x-total-chunks',
    ],
  });

  app.use(ApiDocRedirectMiddleware);
  app.useGlobalFilters(new ErrorHandlersFilter());

  const port = Number(process.env.PORT) || configs.port || 8080;

  console.info('[startup] STEP 3 — listening on port', port);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error(`[startup] FATAL: Failed to start server — ${error.message}`);
  console.error(error.stack || error);
  logger.error(`Failed to start server: ERROR = ${error.message}`);
  process.exit(1);
});
