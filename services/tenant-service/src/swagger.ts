import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';

const SERVICE_PORTS: Record<string, number> = {
  'api-gateway': 3000,
  'auth-service': 3001,
  'webhook-service': 3002,
  'tenant-service': 3003,
  'product-service': 3004,
  'admin-service': 3006,
  'media-service': 3007,
  'edge-service': 3008,
  'payment-service': 3010,
  'order-service': 3011,
  'shipping-service': 3012,
};

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      files.push(...listTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toOpenApiPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function buildUnifiedRouteSpec() {
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const servicesRoot = path.join(workspaceRoot, 'services');
  const serviceDirs = fs.existsSync(servicesRoot)
    ? fs.readdirSync(servicesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];

  const paths: Record<string, Record<string, unknown>> = {};
  const methodRegex = /(app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  for (const serviceName of serviceDirs) {
    const sourceDir = path.join(servicesRoot, serviceName, 'src');
    const files = listTsFiles(sourceDir);
    const port = SERVICE_PORTS[serviceName] || 0;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      let match: RegExpExecArray | null;

      while ((match = methodRegex.exec(content)) !== null) {
        const method = match[2].toLowerCase();
        const originalPath = match[3];
        const normalizedPath = toOpenApiPath(originalPath);
        const catalogPath = `/${serviceName}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;

        if (!paths[catalogPath]) {
          paths[catalogPath] = {};
        }

        if (paths[catalogPath][method]) {
          continue;
        }

        (paths[catalogPath] as Record<string, unknown>)[method] = {
          tags: [serviceName],
          summary: `${method.toUpperCase()} ${originalPath}`,
          description: port
            ? `Original endpoint: http://localhost:${port}${originalPath}`
            : `Original endpoint path: ${originalPath}`,
          responses: {
            200: { description: 'Success' },
          },
        };
      }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'T3CK Core Unified Routes',
      version: process.env.SERVICE_VERSION ?? '1.0.0',
      description: 'Unified route catalog for all services in this workspace.',
    },
    servers: [{ url: 'http://localhost', description: 'Local environment' }],
    tags: Object.keys(SERVICE_PORTS).map((service) => ({
      name: service,
      description: `Service base URL: http://localhost:${SERVICE_PORTS[service]}`,
    })),
    paths,
  };
}

export function setupSwagger(app: Express, opts?: { title?: string; version?: string; basePath?: string }) {
  const title = opts?.title ?? 'Tenant Service API';
  const version = opts?.version ?? process.env.SERVICE_VERSION ?? '1.0.0';

  const swaggerDefinition = {
    openapi: '3.0.0',
    info: { title, version, description: `${title} - OpenAPI spec` },
    servers: [{ url: `http://localhost:${process.env.PORT || 3003}`, description: 'Local' }],
  };

  const options = { swaggerDefinition, apis: ['./src/**/*.ts', './src/**/*.js'] } as swaggerJsdoc.Options;
  const swaggerSpec = swaggerJsdoc(options);
  const unifiedSpec = buildUnifiedRouteSpec();
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
  app.get('/api-docs-all.json', (_req, res) => res.json(unifiedSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/api-docs-all', swaggerUi.serve, swaggerUi.setup(unifiedSpec));
  return swaggerSpec;
}

export default setupSwagger;
