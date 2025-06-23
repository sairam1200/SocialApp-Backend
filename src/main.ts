import configs from './configs';
import { NestFactory } from '@nestjs/core';
import redis from './core/utils/redis.util';
import logger from './core/utils/winston.util';
import { AppModule } from './modules/app.module';
import dataSource from './infrastructure/persistence/data.source';
import { NestExpressApplication } from '@nestjs/platform-express';
import { addScalarApiDocs, addSwaggerApiDocs } from './core/utils/apiDocs.util';
import { ErrorHandlersFilter } from './core/exceptions/exceptionHandler.filter';
import { NotFoundException, ValidationPipe, VersioningType } from '@nestjs/common';
import { ApiDocRedirectMiddleware } from './core/middlewares/apiDocRedirect.middleware';

async function bootstrap() {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
  });

  process.on('uncaughtException', (reason, promise) => {
    logger.error(`Uncaught Exception: ${reason}`);
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await dataSource.initialize();
  app.enableShutdownHooks();

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (configs.env !== 'production') {
    addSwaggerApiDocs(app);
    addScalarApiDocs(app);
  }

  // app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.use(ApiDocRedirectMiddleware);
  app.useGlobalFilters(new ErrorHandlersFilter());

  await redis.connectToRedis();

  await app.listen(configs.port);

  logger.info(`🚀 Application is running on: http://localhost:${configs.port}`);
}
bootstrap().catch((error) => {
  logger.error(`Failed to start server: ERROR = ${error.message}`);
});