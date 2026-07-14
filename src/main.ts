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
import cookieParser from 'cookie-parser';
async function bootstrap() {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
  });

  process.on('uncaughtException', (reason, promise) => {
    logger.error(`Uncaught Exception: ${reason}`);
  });

  console.log('1 Starting');

  await redis.connectToRedis();
  console.log('2 Redis connected');

  const app = await NestFactory.create(AppModule);
  console.log('3 Nest created');
  app.enableShutdownHooks();
  const cookieParser = require('cookie-parser');
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
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

  await app.listen(port, '0.0.0.0');

  logger.info(`🚀 Application is running on port ${port}`);
}
bootstrap().catch((error) => {
  logger.error(`Failed to start server: ERROR = ${error.message}`);
});
