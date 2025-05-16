import configs from './configs';
import { NextFunction } from 'express';
import { NestFactory } from '@nestjs/core';
import logger from './core/utils/winston.util';
import { AppModule } from './modules/app.module';
import { apiReference } from '@scalar/nestjs-api-reference';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorHandlersFilter } from './core/exceptions/exceptionHandler.filter';
import { NotFoundException, ValidationPipe, VersioningType } from '@nestjs/common';
import { ApiDocRedirectMiddleware } from './core/middlewares/apiDocRedirect.middleware';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
  });

  process.on('uncaughtException', (reason, promise) => {
    logger.error(`Uncaught Exception: ${reason}`);
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = configs.port || 3000;

  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (configs.env !== 'production') {

    app.useStaticAssets(join(__dirname, '..', 'public'));

    const config = new DocumentBuilder()
      .setTitle(`${configs.projectName}`)
      .setDescription(`${configs.projectName} api documentation`)
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs-swagger', app, document, {
      customCss: '.swagger-ui .topbar .wrapper .topbar-wrapper { display: flex; justify-content: space-between; align-items: center; }',
      customJs: '/swagger-custom.js',
    });

    app.use(
      '/docs-scalar',
      apiReference({
        spec: {
          content: document
        },
        html: `
        <div style="padding: 10px; text-align: center;">
          <a href="/docs-swagger">
            <button style="padding: 10px; background-color: #007bff; color: white; border-radius: 5px; font-size: 16px;">
              Switch to Swagger UI
            </button>
          </a>
        </div>
      `,
      }),
    );
  }

  // app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.use(ApiDocRedirectMiddleware);

  // app.use((req: Request, res: Response, next: NextFunction) => {
  //   next(new NotFoundException('Route Not found'));
  // });

  app.useGlobalFilters(new ErrorHandlersFilter());

  await app.listen(port);

  logger.info(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap().catch((error) => {
  logger.error(`Failed to start server: ERROR = ${error.message}`);
});