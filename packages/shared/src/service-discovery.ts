/**
 * Service Discovery Module
 * Handles service registration, discovery, and health checks using a registry pattern
 * Suitable for Kubernetes, Docker Swarm, or custom orchestration
 */

import { Logger } from './logger';

const logger = new Logger('service-discovery');

/**
 * Service instance information for registration
 */
export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  scheme: 'http' | 'https';
  metadata?: Record<string, string>;
  healthCheckUrl?: string;
  tags?: string[];
}

/**
 * Service discovery configuration
 */
export interface ServiceDiscoveryConfig {
  registryType?: 'in-memory' | 'consul' | 'aws-ecs' | 'kubernetes';
  environment?: 'development' | 'staging' | 'production';
  healthCheckInterval?: number; // milliseconds
  heartbeatInterval?: number; // milliseconds
}

/**
 * Service registry - stores and provides access to registered services
 */
class ServiceRegistry {
  private services: Map<string, ServiceInstance[]> = new Map();
  private config: ServiceDiscoveryConfig;
  private healthChecks: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: ServiceDiscoveryConfig = {}) {
    this.config = {
      registryType: 'in-memory',
      environment: 'development',
      healthCheckInterval: 30000, // 30 seconds
      ...config,
    };

    logger.info('Service Registry initialized', {
      type: this.config.registryType,
      environment: this.config.environment,
    });
  }

  /**
   * Register a service instance
   */
  async register(instance: ServiceInstance): Promise<void> {
    try {
      if (!this.services.has(instance.name)) {
        this.services.set(instance.name, []);
      }

      // Check if instance already exists
      const existingInstances = this.services.get(instance.name) || [];
      const exists = existingInstances.find((s) => s.id === instance.id);

      if (!exists) {
        existingInstances.push(instance);
        logger.info(`Service registered: ${instance.name}/${instance.id}`, {
          host: instance.host,
          port: instance.port,
          total: existingInstances.length,
        });
      } else {
        logger.warn(`Service already registered: ${instance.name}/${instance.id}`);
      }

      // Start health check if URL provided
      if (instance.healthCheckUrl) {
        this.startHealthCheck(instance);
      }
    } catch (error) {
      logger.error(`Failed to register service: ${instance.name}`, {
        id: instance.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Deregister a service instance
   */
  async deregister(serviceName: string, instanceId: string): Promise<void> {
    try {
      const instances = this.services.get(serviceName);
      if (!instances) {
        logger.warn(`Service not found: ${serviceName}`);
        return;
      }

      const index = instances.findIndex((s) => s.id === instanceId);
      if (index >= 0) {
        instances.splice(index, 1);

        // Stop health check
        const healthCheckKey = `${serviceName}/${instanceId}`;
        const timeout = this.healthChecks.get(healthCheckKey);
        if (timeout) {
          clearInterval(timeout);
          this.healthChecks.delete(healthCheckKey);
        }

        // Remove service entry if no more instances
        if (instances.length === 0) {
          this.services.delete(serviceName);
        }

        logger.info(`Service deregistered: ${serviceName}/${instanceId}`, {
          remaining: instances.length,
        });
      }
    } catch (error) {
      logger.error(`Failed to deregister service: ${serviceName}`, {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Discover service instances
   */
  discover(serviceName: string): ServiceInstance[] {
    const instances = this.services.get(serviceName) || [];
    if (instances.length === 0) {
      logger.warn(`No instances found for service: ${serviceName}`);
    }
    return instances;
  }

  /**
   * Get a single instance using load balancing (round-robin)
   */
  getRandomInstance(serviceName: string): ServiceInstance | null {
    const instances = this.discover(serviceName);
    if (instances.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  /**
   * Build URL for a service
   */
  buildServiceUrl(serviceName: string, path: string = ''): string | null {
    const instance = this.getRandomInstance(serviceName);
    if (!instance) {
      return null;
    }
    const baseUrl = `${instance.scheme}://${instance.host}:${instance.port}`;
    return path ? `${baseUrl}${path}` : baseUrl;
  }

  /**
   * Get all registered services
   */
  getServices(): Record<string, ServiceInstance[]> {
    const result: Record<string, ServiceInstance[]> = {};
    this.services.forEach((instances, name) => {
      result[name] = instances;
    });
    return result;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalServices: number;
    totalInstances: number;
    services: Record<string, number>;
  } {
    const services: Record<string, number> = {};
    let totalInstances = 0;

    this.services.forEach((instances, name) => {
      services[name] = instances.length;
      totalInstances += instances.length;
    });

    return {
      totalServices: this.services.size,
      totalInstances,
      services,
    };
  }

  /**
   * Start health check for a service instance
   */
  private startHealthCheck(instance: ServiceInstance): void {
    if (!instance.healthCheckUrl) return;

    const key = `${instance.name}/${instance.id}`;

    // Clear existing health check
    const existingTimeout = this.healthChecks.get(key);
    if (existingTimeout) {
      clearInterval(existingTimeout);
    }

    // Start new health check
    const timeout = setInterval(async () => {
      try {
        const url = `${instance.scheme}://${instance.host}:${instance.port}${instance.healthCheckUrl}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });

          if (!response.ok) {
            logger.warn(`Health check failed for ${key}`, {
              status: response.status,
            });
            // Could deregister here if needed
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        logger.error(`Health check error for ${key}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.healthCheckInterval);

    this.healthChecks.set(key, timeout);
    logger.debug(`Health check started for ${key}`);
  }

  /**
   * Clear all health checks and services
   */
  clear(): void {
    this.healthChecks.forEach((timeout) => clearInterval(timeout));
    this.healthChecks.clear();
    this.services.clear();
    logger.info('Service registry cleared');
  }
}

// Global registry instance
let globalRegistry: ServiceRegistry | null = null;

/**
 * Initialize the global service registry
 */
export function initializeServiceDiscovery(config?: ServiceDiscoveryConfig): ServiceRegistry {
  if (!globalRegistry) {
    globalRegistry = new ServiceRegistry(config);
  }
  return globalRegistry;
}

/**
 * Get the global service registry
 */
export function getServiceRegistry(): ServiceRegistry {
  if (!globalRegistry) {
    globalRegistry = new ServiceRegistry();
  }
  return globalRegistry;
}

/**
 * Register the current service
 */
export async function registerService(instance: ServiceInstance): Promise<void> {
  const registry = getServiceRegistry();
  await registry.register(instance);
}

/**
 * Deregister the current service
 */
export async function deregisterService(serviceName: string, instanceId: string): Promise<void> {
  const registry = getServiceRegistry();
  await registry.deregister(serviceName, instanceId);
}

/**
 * Discover service instances
 */
export function discoverService(serviceName: string): ServiceInstance[] {
  const registry = getServiceRegistry();
  return registry.discover(serviceName);
}

/**
 * Get a single instance with load balancing
 */
export function getServiceInstance(serviceName: string): ServiceInstance | null {
  const registry = getServiceRegistry();
  return registry.getRandomInstance(serviceName);
}

/**
 * Build a URL for a service
 */
export function buildServiceUrl(serviceName: string, path?: string): string | null {
  const registry = getServiceRegistry();
  return registry.buildServiceUrl(serviceName, path);
}

/**
 * Get service statistics
 */
export function getServiceStats() {
  const registry = getServiceRegistry();
  return registry.getStats();
}

/**
 * Shutdown service discovery
 */
export function closeServiceDiscovery(): void {
  if (globalRegistry) {
    globalRegistry.clear();
    globalRegistry = null;
    logger.info('Service discovery closed');
  }
}
