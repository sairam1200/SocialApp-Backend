import configs from './configs';
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
import cookieParser = require('cookie-parser');

console.info(`[startup] main.ts loaded — PID ${process.pid}, NODE_ENV=${process.env.NODE_ENV}, K_SERVICE=${process.env.K_SERVICE || 'none'}`);

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
    console.warn(`[startup] Redis unavailable (${msg}). Continuing without Redis.`);
    logger.warn(`Redis unavailable (${msg}). Continuing without Redis.`);
  }

  console.info('[startup] STEP 1 — creating NestFactory');
  const app = await NestFactory.create(AppModule);
  console.info('[startup] STEP 2 — NestFactory created');

  app.enableShutdownHooks();
  app.use(cookieParser());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (configs.env !== 'production') {
    addSwaggerApiDocs(app);
    addScalarApiDocs(app);
    addWebSocketDocs(app);
  }

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://socialapp-sg.onrender.com',
      'https://almost-backtrack-drapery.ngrok-free.dev',
      'https://social-app-zeta-three.vercel.app',
      'https://demo.gaddr.com',
    ],
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
