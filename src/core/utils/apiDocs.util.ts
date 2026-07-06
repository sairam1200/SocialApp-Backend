import configs from '../../configs';
import { INestApplication } from '@nestjs/common';
import { apiReference } from '@scalar/nestjs-api-reference';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/winston.util';

export function addSwaggerApiDocs(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${configs.projectName}`)
    .setDescription(
      `${configs.projectName} api documentation
     <div style="padding: 10px; text-align: center; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
      <a href="/docs-scalar">
        <button style="padding: 10px; background-color: #1c2132 !important; color: white; border-radius: 5px; font-size: 16px; border: none; cursor: pointer;">
          Switch to Scalar API Reference
        </button>
      </a>
      <a href="/docs-websocket">
        <button style="padding: 10px; background-color: #6366f1 !important; color: white; border-radius: 5px; font-size: 16px; border: none; cursor: pointer;">
          WebSocket API Documentation
        </button>
      </a>
    </div>
    `,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs-swagger',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}

export function addScalarApiDocs(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle(`${configs.projectName}`)
    .setDescription(
      `${configs.projectName} api documentation
           <div style="padding: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="/docs-swagger">
              <button style="padding: 10px; background-color: #1c2132 !important; color: white; border-radius: 5px; font-size: 16px; border: none; cursor: pointer;">
                Switch to Swagger API Reference
              </button>
            </a>
            <a href="/docs-websocket">
              <button style="padding: 10px; background-color: #6366f1 !important; color: white; border-radius: 5px; font-size: 16px; border: none; cursor: pointer;">
                WebSocket API Documentation
              </button>
            </a>
          </div>
          `,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  app.use('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    res.status(204).send();
  });

  app.use(
    '/docs-scalar',
    apiReference({
      content: SwaggerModule.createDocument(app, config),
    }),
  );
}

export function addWebSocketDocs(app: INestApplication) {
  const asyncApiPath = path.join(process.cwd(), 'docs', 'asyncapi.yaml');

  if (!fs.existsSync(asyncApiPath)) {
    logger.warn(`AsyncAPI specification file not found at: ${asyncApiPath}`);
    return;
  }

  try {
    const asyncApiContent = fs.readFileSync(asyncApiPath, 'utf-8');

    const yaml = require('yaml');
    const asyncApiSpec = yaml.parse(asyncApiContent);
    const httpAdapter = app.getHttpAdapter();

    let componentPath: string;
    let standaloneJsPath: string;
    let cssPath: string;

    try {
      const packageJsonPath = require.resolve(
        '@asyncapi/react-component/package.json',
      );
      componentPath = path.dirname(packageJsonPath);
      standaloneJsPath = path.join(
        componentPath,
        'browser',
        'standalone',
        'index.js',
      );
      cssPath = path.join(componentPath, 'styles', 'default.min.css');
    } catch (error) {
      logger.error(
        'Failed to resolve @asyncapi/react-component package:',
        error,
      );
      throw new Error(
        'AsyncAPI React component package not found. Make sure @asyncapi/react-component is installed.',
      );
    }

    httpAdapter.get('/docs-websocket/spec.json', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json(asyncApiSpec);
    });

    httpAdapter.get('/docs-websocket/asyncapi-component.js', (req, res) => {
      if (fs.existsSync(standaloneJsPath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(fs.readFileSync(standaloneJsPath, 'utf-8'));
      } else {
        logger.error(`AsyncAPI component JS not found at: ${standaloneJsPath}`);
        res.status(404).send('Component not found');
      }
    });

    httpAdapter.get('/docs-websocket/asyncapi-component.css', (req, res) => {
      if (fs.existsSync(cssPath)) {
        res.setHeader('Content-Type', 'text/css');
        res.send(fs.readFileSync(cssPath, 'utf-8'));
      } else {
        logger.error(`AsyncAPI component CSS not found at: ${cssPath}`);
        res.status(404).send('Styles not found');
      }
    });

    httpAdapter.get('/docs-websocket', (req, res) => {
      const htmlTemplatePath = path.join(
        process.cwd(),
        'docs',
        'AsyncAPI',
        'index.html',
      );

      if (!fs.existsSync(htmlTemplatePath)) {
        logger.error(
          `AsyncAPI HTML template not found at: ${htmlTemplatePath}`,
        );
        res.status(500).send('AsyncAPI documentation template not found');
        return;
      }

      const htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf-8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlTemplate);
    });

    logger.info('WebSocket API documentation available at /docs-websocket');
  } catch (error) {
    logger.error('Failed to load WebSocket API documentation:', error);
  }
}
