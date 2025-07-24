import configs from "../../configs";
import { INestApplication } from "@nestjs/common";
import { apiReference } from "@scalar/nestjs-api-reference";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function addSwaggerApiDocs(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${configs.projectName}`)
    .setDescription(`${configs.projectName} api documentation
     <div style="padding: 10px; text-align: center;">
      <a href="/docs-scalar">
        <button style="padding: 10px; background-color: #1c2132 !important; color: white; border-radius: 5px; font-size: 16px;">
          Switch to Scalar API Reference
        </button>
      </a>
    </div>
    `)
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs-swagger', app, SwaggerModule.createDocument(app, swaggerConfig));
}

export function addScalarApiDocs(app: INestApplication) {

  const config = new DocumentBuilder()
    .setTitle(`${configs.projectName}`)
    .setDescription(`${configs.projectName} api documentation
           <div style="padding: 10px;">
            <a href="/docs-swagger">
              <button>
                Switch to Swagger API Reference
              </button>
            </a>
          </div>
          `)
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  app.use('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    res.status(204).send();
  });

  app.use(
    '/docs-scalar',
    apiReference({
      content: SwaggerModule.createDocument(app, config)
    }),
  );
}