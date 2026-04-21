/**
 * Webhook Event Versioning Management
 * Handles backward compatibility for webhooks as event schemas evolve
 */

export enum EventVersion {
  V1 = '1.0',
  V2 = '2.0',
  LATEST = '2.0',
}

/**
 * Base event structure with versioning metadata
 */
export interface VersionedEvent {
  id: string;
  tenantId: string;
  type: string;
  version: EventVersion;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: {
    sourceService: string;
    correlationId?: string;
    causationId?: string;
  };
}

/**
 * Event schema definitions by version
 */
export interface EventSchemaVersion {
  version: EventVersion;
  description: string;
  schema: Record<string, unknown>;
  deprecatedFields?: string[];
  newFields?: string[];
  breaking: boolean;
  migrateFrom?: EventVersion;
}

/**
 * Supported event types with version history
 */
export const EventSchemas: Record<string, Record<EventVersion, EventSchemaVersion>> = {
  'order.created': {
    [EventVersion.V1]: {
      version: EventVersion.V1,
      description: 'Initial order creation event',
      schema: {
        orderId: { type: 'string', required: true },
        customerId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
        currency: { type: 'string', required: true, default: 'USD' },
        items: {
          type: 'array',
          items: {
            productId: { type: 'string' },
            quantity: { type: 'number' },
            price: { type: 'number' },
          },
        },
        createdAt: { type: 'string', format: 'date-time', required: true },
      },
      breaking: false,
    },
    [EventVersion.V2]: {
      version: EventVersion.V2,
      description: 'Enhanced order creation with billing/shipping split',
      schema: {
        orderId: { type: 'string', required: true },
        customerId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
        currency: { type: 'string', required: true, default: 'USD' },
        billingAddress: {
          type: 'object',
          required: true,
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
          },
        },
        shippingAddress: {
          type: 'object',
          required: true,
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
          },
        },
        items: {
          type: 'array',
          items: {
            productId: { type: 'string' },
            quantity: { type: 'number' },
            price: { type: 'number' },
            sku: { type: 'string' }, // New field in V2
          },
        },
        shippingCost: { type: 'number' }, // New field in V2
        taxCost: { type: 'number' }, // New field in V2
        createdAt: { type: 'string', format: 'date-time', required: true },
      },
      deprecatedFields: [],
      newFields: ['billingAddress', 'shippingAddress', 'shippingCost', 'taxCost'],
      breaking: true, // New required fields
      migrateFrom: EventVersion.V1,
    },
  },
  'payment.processed': {
    [EventVersion.V1]: {
      version: EventVersion.V1,
      description: 'Initial payment processing event',
      schema: {
        paymentId: { type: 'string', required: true },
        orderId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
        status: { type: 'string', enum: ['success', 'failed', 'pending'] },
        method: { type: 'string' },
        processedAt: { type: 'string', format: 'date-time', required: true },
      },
      breaking: false,
    },
    [EventVersion.V2]: {
      version: EventVersion.V2,
      description: 'Enhanced with PCI compliance and 3D Secure info',
      schema: {
        paymentId: { type: 'string', required: true },
        orderId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
        currency: { type: 'string', required: true },
        status: { type: 'string', enum: ['success', 'failed', 'pending', 'disputed'] },
        method: { type: 'string' },
        methodDetails: {
          type: 'object',
          properties: {
            last4: { type: 'string' },
            brand: { type: 'string' },
            country: { type: 'string' },
          },
        },
        threeDSecure: { type: 'boolean' }, // New field
        riskScore: { type: 'number', min: 0, max: 100 }, // New field
        processedAt: { type: 'string', format: 'date-time', required: true },
      },
      deprecatedFields: [],
      newFields: ['methodDetails', 'threeDSecure', 'riskScore'],
      breaking: false,
      migrateFrom: EventVersion.V1,
    },
  },
};

/**
 * Event versioning service for backward compatibility
 */
export class EventVersioningService {
  /**
   * Migrate event from one version to another
   */
  static migrateEvent(event: VersionedEvent, targetVersion: EventVersion): VersionedEvent {
    if (event.version === targetVersion) {
      return event;
    }

    // Get migration path
    const schemas = EventSchemas[event.type];
    if (!schemas) {
      throw new Error(`Unknown event type: ${event.type}`);
    }

    const targetSchema = schemas[targetVersion];

    if (!targetSchema) {
      throw new Error(
        `Target version ${targetVersion} not available for event type: ${event.type}`
      );
    }

    // Apply transformations
    let migratedData = { ...event.data };

    if (event.version === EventVersion.V1 && targetVersion === EventVersion.V2) {
      migratedData = this.migrateV1ToV2(event.type, migratedData);
    }

    return {
      ...event,
      version: targetVersion,
      data: migratedData,
    };
  }

  /**
   * Transform event data from V1 to V2 schema
   */
  private static migrateV1ToV2(
    eventType: string,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    // Event-specific migrations
    switch (eventType) {
      case 'order.created': {
        return {
          ...data,
          billingAddress: {
            street: '', // Would need to be populated from context
            city: '',
            country: '',
          },
          shippingAddress: {
            street: '',
            city: '',
            country: '',
          },
          shippingCost: 0,
          taxCost: 0,
        };
      }
      case 'payment.processed': {
        return {
          ...data,
          methodDetails: {
            last4: '',
            brand: '',
            country: '',
          },
          threeDSecure: false,
          riskScore: 0,
        };
      }
      default:
        return data;
    }
  }

  /**
   * Get all available versions for an event type
   */
  static getAvailableVersions(eventType: string): EventVersion[] {
    const schemas = EventSchemas[eventType];
    if (!schemas) {
      return [];
    }
    return Object.keys(schemas) as EventVersion[];
  }

  /**
   * Check if event is still compatible with subscribers
   */
  static isEventCompatible(
    eventType: string,
    eventVersion: EventVersion,
    subscriberVersion: EventVersion
  ): { compatible: boolean; migratable: boolean; breaking: boolean } {
    const schemas = EventSchemas[eventType];

    if (!schemas) {
      return { compatible: false, migratable: false, breaking: false };
    }

    const eventSchema = schemas[eventVersion];
    const subscriberSchema = schemas[subscriberVersion];

    if (!eventSchema || !subscriberSchema) {
      return { compatible: false, migratable: false, breaking: false };
    }

    const compatible = eventVersion === subscriberVersion;
    const breaking = subscriberSchema.breaking || false;
    const migratable = true; // Assume all versions are migratable

    return { compatible, migratable, breaking };
  }

  /**
   * Validate event data against schema
   */
  static validateEvent(event: VersionedEvent): { valid: boolean; errors: string[] } {
    const schemas = EventSchemas[event.type];
    if (!schemas) {
      return { valid: false, errors: [`Unknown event type: ${event.type}`] };
    }

    const schema = schemas[event.version];
    if (!schema) {
      return {
        valid: false,
        errors: [`Version ${event.version} not defined for event type: ${event.type}`],
      };
    }

    const errors: string[] = [];

    // Basic validation - would be more sophisticated in real implementation
    const requiredFields = Object.entries(schema.schema)
      .filter(([, field]) => (field as Record<string, unknown>).required === true)
      .map(([key]) => key);

    for (const field of requiredFields) {
      if (!(field in event.data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get schema documentation for an event version
   */
  static getSchemaDocumentation(
    eventType: string,
    version: EventVersion
  ): EventSchemaVersion | null {
    const schemas = EventSchemas[eventType];
    if (!schemas) {
      return null;
    }

    return schemas[version] || null;
  }
}
