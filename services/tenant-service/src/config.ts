import { SSMClient, GetParameterCommand, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface ConfigOptions {
  region?: string;
  parameterPrefix?: string;
  environment?: string;
}

export class ConfigManager {
  private ssmClient: SSMClient;
  private secretsClient: SecretsManagerClient;
  private parameterCache: Map<string, any> = new Map();
  private secretCache: Map<string, any> = new Map();
  private cacheTTL: number = 300000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();
  private parameterPrefix: string;
  private environment: string;

  constructor(options?: ConfigOptions) {
    const region = options?.region || process.env.AWS_REGION || 'us-east-1';
    this.parameterPrefix = options?.parameterPrefix || '/t3ck-core';
    this.environment = options?.environment || process.env.NODE_ENV || 'development';

    this.ssmClient = new SSMClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
  }

  /**
   * Get single parameter from Parameter Store
   */
  async getParameter(name: string, decrypt: boolean = false): Promise<string | null> {
    try {
      const fullName = this.getParameterName(name);

      // Check cache
      if (this.parameterCache.has(fullName)) {
        const timestamp = this.cacheTimestamps.get(fullName);
        if (timestamp && Date.now() - timestamp < this.cacheTTL) {
          return this.parameterCache.get(fullName);
        }
      }

      const command = new GetParameterCommand({
        Name: fullName,
        WithDecryption: decrypt,
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameter?.Value) {
        this.parameterCache.set(fullName, response.Parameter.Value);
        this.cacheTimestamps.set(fullName, Date.now());
        return response.Parameter.Value;
      }

      return null;
    } catch (error) {
      console.error(`[ConfigManager] Error getting parameter ${name}:`, error);
      return null;
    }
  }

  /**
   * Get all parameters with prefix
   */
  async getParametersByPath(pathPrefix?: string): Promise<Record<string, string>> {
    try {
      const path = pathPrefix || this.parameterPrefix;
      const result: Record<string, string> = {};

      const command = new GetParametersByPathCommand({
        Path: path,
        Recursive: true,
        WithDecryption: true,
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            const key = param.Name.replace(path + '/', '');
            result[key] = param.Value;
          }
        }
      }

      return result;
    } catch (error) {
      console.error('[ConfigManager] Error getting parameters by path:', error);
      return {};
    }
  }

  /**
   * Get secret from Secrets Manager
   */
  async getSecret(secretName: string): Promise<Record<string, any> | null> {
    try {
      // Check cache
      if (this.secretCache.has(secretName)) {
        const timestamp = this.cacheTimestamps.get(secretName);
        if (timestamp && Date.now() - timestamp < this.cacheTTL) {
          return this.secretCache.get(secretName);
        }
      }

      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.secretsClient.send(command);

      let secretValue: Record<string, any> = {};

      if (response.SecretString) {
        try {
          secretValue = JSON.parse(response.SecretString);
        } catch {
          secretValue = { value: response.SecretString };
        }
      } else if (response.SecretBinary) {
        secretValue = { binary: response.SecretBinary };
      }

      this.secretCache.set(secretName, secretValue);
      this.cacheTimestamps.set(secretName, Date.now());

      return secretValue;
    } catch (error) {
      console.error(`[ConfigManager] Error getting secret ${secretName}:`, error);
      return null;
    }
  }

  /**
   * Get config value with fallback to environment variable
   */
  async getConfig(key: string, defaultValue?: string, decrypt: boolean = false): Promise<string> {
    // Try Parameter Store first
    const paramValue = await this.getParameter(key, decrypt);
    if (paramValue) {
      return paramValue;
    }

    // Fallback to environment variable
    const envKey = key.toUpperCase().replace(/-/g, '_');
    const envValue = process.env[envKey];
    if (envValue) {
      return envValue;
    }

    // Return default or empty string
    return defaultValue || '';
  }

  /**
   * Get config value as boolean
   */
  async getConfigBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.getConfig(key);
    if (!value) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get config value as number
   */
  async getConfigNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getConfig(key);
    if (!value) {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Clear cache for specific key
   */
  clearCache(key?: string): void {
    if (key) {
      const fullName = this.getParameterName(key);
      this.parameterCache.delete(fullName);
      this.secretCache.delete(key);
      this.cacheTimestamps.delete(fullName);
    } else {
      this.parameterCache.clear();
      this.secretCache.clear();
      this.cacheTimestamps.clear();
    }
  }

  /**
   * Get full parameter name with prefix and environment
   */
  private getParameterName(name: string): string {
    return `${this.parameterPrefix}/${this.environment}/${name}`;
  }

  /**
   * Gracefully close AWS clients
   */
  async close(): Promise<void> {
    try {
      this.ssmClient.destroy();
      this.secretsClient.destroy();
      console.log('[ConfigManager] AWS clients closed');
    } catch (error) {
      console.error('[ConfigManager] Error closing clients:', error);
    }
  }
}

// Singleton instance
let configInstance: ConfigManager | null = null;

export function initializeConfig(options?: ConfigOptions): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager(options);
  }
  return configInstance;
}

export function getConfig(): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager();
  }
  return configInstance;
}
