import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

export function setupSwagger(
  app: Express,
  opts?: { title?: string; version?: string; basePath?: string }
) {
  const title = opts?.title ?? 'Webhook Service API';
  const version = opts?.version ?? process.env.SERVICE_VERSION ?? '1.0.0';

  const swaggerDefinition = {
    openapi: '3.0.0',
    info: { title, version, description: `${title} - OpenAPI spec` },
    servers: [{ url: `http://localhost:${process.env.PORT || 3002}`, description: 'Local' }],
  };

  const options = {
    swaggerDefinition,
    apis: ['./src/**/*.ts', './src/**/*.js'],
  } as swaggerJsdoc.Options;
  const swaggerSpec = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  return swaggerSpec;
}

export default setupSwagger;
