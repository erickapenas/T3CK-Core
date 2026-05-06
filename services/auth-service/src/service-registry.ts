import { Logger } from '@t3ck/shared';
import { Counter } from 'prom-client';
import {
  DeregisterInstanceCommand,
  RegisterInstanceCommand,
  ServiceDiscoveryClient,
} from '@aws-sdk/client-servicediscovery';

const logger = new Logger('service-registry');

// Prometheus counters for registration metrics
const registerAttempts = new Counter({
  name: 'service_registry_register_attempts_total',
  help: 'Service registry register attempts',
});
const registerFailures = new Counter({
  name: 'service_registry_register_failures_total',
  help: 'Service registry register failures',
});
const deregisterAttempts = new Counter({
  name: 'service_registry_deregister_attempts_total',
  help: 'Service registry deregister attempts',
});
const deregisterFailures = new Counter({
  name: 'service_registry_deregister_failures_total',
  help: 'Service registry deregister failures',
});

interface ServiceInstance {
  instanceId: string;
  serviceId: string;
  port: number;
  ipAddress?: string;
  metadata?: Record<string, string>;
}

class ServiceRegistry {
  private static instance: ServiceRegistry;
  private registeredInstances: Map<string, ServiceInstance> = new Map();
  private isHealthy = true;
  private client: ServiceDiscoveryClient;

  private constructor() {
    this.client = new ServiceDiscoveryClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    logger.info('ServiceRegistry initialized (Cloud Map mode)');
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register service instance in service registry
   * @param serviceName - Name of the service (e.g., 't3ck-auth')
   * @param port - Port the service is running on
   * @param metadata - Optional metadata (version, environment, etc.)
   */
  async registerInstance(
    serviceName: string,
    port: number,
    metadata?: Record<string, string>
  ): Promise<string> {
    registerAttempts.inc();
    try {
      const hostname = process.env.HOSTNAME || 'localhost';
      const instanceId = `${hostname}-${port}`;
      const registryServiceId = this.getCloudMapServiceId(serviceName);

      const serviceInstance: ServiceInstance = {
        instanceId,
        serviceId: serviceName,
        port,
        ipAddress: process.env.POD_IP || '127.0.0.1',
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          version: process.env.SERVICE_VERSION || '1.0.0',
          region: process.env.AWS_REGION || 'us-east-1',
          ...metadata,
        },
      };

      await this.client.send(
        new RegisterInstanceCommand({
          ServiceId: registryServiceId,
          InstanceId: instanceId,
          Attributes: {
            ...serviceInstance.metadata,
            AWS_INSTANCE_IPV4: serviceInstance.ipAddress || '127.0.0.1',
            AWS_INSTANCE_PORT: String(port),
          },
        })
      );

      this.registeredInstances.set(serviceName, serviceInstance);
      this.isHealthy = true;

      logger.info(`Service registered: ${serviceName}`, {
        instanceId,
        port,
        ipAddress: serviceInstance.ipAddress,
        metadata: serviceInstance.metadata,
      });

      return instanceId;
    } catch (error) {
      registerFailures.inc();
      logger.error('Failed to register service instance', {
        serviceName,
        port,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - allow graceful degradation
      this.isHealthy = false;
      throw new Error(
        `Failed to register service instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Deregister service instance from service registry
   * @param serviceName - Name of the service
   */
  async deregisterInstance(serviceName: string): Promise<void> {
    deregisterAttempts.inc();
    try {
      const instance = this.registeredInstances.get(serviceName);
      if (!instance) {
        logger.warn('Instance not found for deregistration', { serviceName });
        return;
      }

      await this.client.send(
        new DeregisterInstanceCommand({
          ServiceId: this.getCloudMapServiceId(serviceName),
          InstanceId: instance.instanceId,
        })
      );

      this.registeredInstances.delete(serviceName);
      logger.info(`Service deregistered: ${serviceName}`, {
        instanceId: instance.instanceId,
      });
    } catch (error) {
      deregisterFailures.inc();
      logger.error('Failed to deregister service instance', {
        serviceName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to deregister service instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get service instance information
   * @param serviceName - Name of the service
   */
  getInstanceInfo(serviceName: string): ServiceInstance | undefined {
    return this.registeredInstances.get(serviceName);
  }

  /**
   * Check if all registrations are healthy
   */
  isAllRegistered(): boolean {
    return this.isHealthy && this.registeredInstances.size > 0;
  }

  /**
   * Get all registered instances
   */
  getAllInstances(): Map<string, ServiceInstance> {
    return new Map(this.registeredInstances);
  }

  /**
   * Close service registry
   */
  async close(): Promise<void> {
    try {
      this.registeredInstances.clear();
      this.client.destroy();
      logger.info('ServiceRegistry closed');
    } catch (error) {
      logger.error('Error closing ServiceRegistry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getCloudMapServiceId(serviceName: string): string {
    return (
      process.env.CLOUD_MAP_SERVICE_ID || process.env.SERVICE_DISCOVERY_SERVICE_ID || serviceName
    );
  }
}

// Export singleton
export function getServiceRegistry(): ServiceRegistry {
  return ServiceRegistry.getInstance();
}

/**
 * Initialize service registry and register in Cloud Map
 * @param serviceName - Name of the service
 * @param port - Port number
 * @param metadata - Optional metadata
 */
export async function initializeServiceRegistry(
  serviceName: string,
  port: number,
  metadata?: Record<string, string>
): Promise<void> {
  const registry = getServiceRegistry();

  // Auto-register with environment info
  const envMetadata = {
    environment: process.env.NODE_ENV || 'development',
    version: process.env.SERVICE_VERSION || '1.0.0',
    region: process.env.AWS_REGION || 'us-east-1',
    ...metadata,
  };

  await registry.registerInstance(serviceName, port, envMetadata);

  // Setup graceful deregistration on shutdown
  process.on('SIGTERM', async () => {
    await registry.deregisterInstance(serviceName);
    await registry.close();
  });
}

export type { ServiceInstance };
