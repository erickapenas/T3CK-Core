import { ServiceDiscoveryClient, RegisterInstanceCommand, DeregisterInstanceCommand } from '@aws-sdk/client-servicediscovery';
import { Logger } from '@t3ck/shared';

const logger = new Logger('service-registry');

interface ServiceInstance {
  instanceId?: string;
  serviceId: string;
  port: number;
  ipAddress?: string;
  metadata?: Record<string, string>;
}

class ServiceRegistry {
  private static instance: ServiceRegistry;
  private client: ServiceDiscoveryClient;
  private registeredInstances: Map<string, ServiceInstance> = new Map();
  private isHealthy = true;

  private constructor() {
    this.client = new ServiceDiscoveryClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register service instance in AWS Cloud Map
   * @param serviceName - Name of the service (e.g., 't3ck-auth')
   * @param port - Port the service is running on
   * @param metadata - Optional metadata (version, environment, etc.)
   */
  async registerInstance(
    serviceName: string,
    port: number,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      // Generate instance ID from hostname + port if not provided
      const hostname = process.env.HOSTNAME || 'localhost';
      const instanceId = `${hostname}-${port}`;

      const command = new RegisterInstanceCommand({
        ServiceId: serviceName, // Cloud Map service ID or name
        InstanceId: instanceId,
        Attributes: {
          AWS_INSTANCE_PORT: port.toString(),
          AWS_INSTANCE_IPV4: process.env.POD_IP || '127.0.0.1',
          ...metadata,
        },
      });

      const response = await this.client.send(command);
      this.registeredInstances.set(serviceName, {
        instanceId,
        serviceId: serviceName,
        port,
        ipAddress: process.env.POD_IP || '127.0.0.1',
        metadata,
      });

      logger.info(`Service registered: ${serviceName}`, {
        instanceId,
        port,
        operationId: response.OperationId,
      });

      return instanceId;
    } catch (error) {
      logger.error('Failed to register service instance', {
        serviceName,
        port,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - allow graceful degradation
      this.isHealthy = false;
      return `${process.env.HOSTNAME || 'localhost'}-${port}-fallback`;
    }
  }

  /**
   * Deregister service instance from AWS Cloud Map
   * @param serviceName - Name of the service
   */
  async deregisterInstance(serviceName: string): Promise<void> {
    try {
      const instance = this.registeredInstances.get(serviceName);
      if (!instance) {
        logger.warn('Instance not found for deregistration', { serviceName });
        return;
      }

      const command = new DeregisterInstanceCommand({
        ServiceId: serviceName,
        InstanceId: instance.instanceId,
      });

      const response = await this.client.send(command);
      this.registeredInstances.delete(serviceName);

      logger.info(`Service deregistered: ${serviceName}`, {
        instanceId: instance.instanceId,
        operationId: response.OperationId,
      });
    } catch (error) {
      logger.error('Failed to deregister service instance', {
        serviceName,
        error: error instanceof Error ? error.message : String(error),
      });
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
   * Close AWS SDK client
   */
  async close(): Promise<void> {
    try {
      this.client.destroy();
      logger.info('ServiceRegistry client closed');
    } catch (error) {
      logger.error('Error closing ServiceRegistry client', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
