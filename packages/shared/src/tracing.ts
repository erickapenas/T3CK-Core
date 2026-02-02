import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Logger } from './logger';

const logger = new Logger('telemetry');

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry distributed tracing
 * Automatically instruments:
 * - HTTP requests/responses
 * - Express middleware
 * - Database queries
 * - Lambda invocations
 */
export function initializeTracing(serviceName: string): void {
  if (sdk) {
    logger.warn('Tracing already initialized');
    return;
  }

  try {
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
    const environment = process.env.NODE_ENV || 'development';

    logger.info('Initializing OpenTelemetry tracing', {
      serviceName,
      otlpEndpoint,
      environment,
    });

    // Create resource with service metadata using plain object (reserved for future use)
    // const resourceObj = {
    //   [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    //   [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
    //   environment,
    //   region: process.env.AWS_REGION || 'us-east-1',
    // };

    // Initialize SDK with auto-instrumentation
    sdk = new NodeSDK({
      resourceDetectors: [],
      traceExporter: new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
        headers: {
          'Content-Type': 'application/json',
        },
      } as any),
      instrumentations: [getNodeAutoInstrumentations()],
    } as any);

    sdk.start();
    logger.info('OpenTelemetry tracing initialized successfully');

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Shutting down OpenTelemetry SDK');
      try {
        await sdk?.shutdown();
        logger.info('OpenTelemetry SDK shut down successfully');
      } catch (error) {
        logger.error('Error shutting down OpenTelemetry SDK', { error });
      }
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', { error });
    throw error;
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      sdk = null;
      logger.info('OpenTelemetry SDK shut down');
    } catch (error) {
      logger.error('Error shutting down OpenTelemetry SDK', { error });
    }
  }
}

/**
 * Get OpenTelemetry tracer instance for manual span creation
 */
export function getTracer(name: string, version?: string) {
  const otel = require('@opentelemetry/api');
  return otel.trace.getTracer(name, version);
}
