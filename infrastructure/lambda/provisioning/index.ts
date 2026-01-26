import { Handler, SQSEvent, Context } from 'aws-lambda';
import { createLogger } from './logger';

interface ProvisioningInput {
  tenantId: string;
  domain: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  region: string;
  action?: 'apply' | 'destroy' | 'deploy';
  [key: string]: unknown;
}

interface ProvisioningContext {
  tenantId: string;
  step: string;
  action: string;
  startTime: number;
}

const logger = createLogger('ProvisioningLambda');

/**
 * Structured logging wrapper to add context to all logs
 */
class ContextualLogger {
  constructor(private context: ProvisioningContext) {}

  info(message: string, data?: Record<string, unknown>) {
    logger.info(message, {
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  error(message: string, error?: Error | Record<string, unknown>) {
    const errorData = error instanceof Error ? {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    } : error;

    logger.error(message, {
      ...this.context,
      ...errorData,
      timestamp: new Date().toISOString(),
    });
  }

  debug(message: string, data?: Record<string, unknown>) {
    logger.debug(message, {
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Generic orchestration function for executing provisioning tasks
 * Handles Terraform and CDK execution requests from Step Functions
 */
async function orchestrateProvisioning(
  input: ProvisioningInput,
  context: ProvisioningContext
): Promise<Record<string, unknown>> {
  const contextualLogger = new ContextualLogger(context);

  try {
    contextualLogger.info('Starting provisioning orchestration', {
      input: JSON.stringify(input),
    });

    // Validate required fields
    validateInput(input, context);

    // Execute based on action type
    let result: Record<string, unknown>;

    switch (input.action) {
      case 'apply':
      case 'deploy':
        result = await executeProvisioning(input, context);
        break;
      case 'destroy':
        result = await destroyProvisioning(input, context);
        break;
      default:
        result = await executeProvisioning(input, context);
    }

    contextualLogger.info('Provisioning orchestration completed successfully', {
      result: JSON.stringify(result),
      duration: Date.now() - context.startTime,
    });

    return {
      statusCode: 200,
      status: 'SUCCESS',
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    contextualLogger.error('Provisioning orchestration failed', {
      error,
      duration: Date.now() - context.startTime,
    });

    throw {
      statusCode: 500,
      status: 'FAILED',
      errorCode: errorName,
      errorMessage,
      tenantId: context.tenantId,
      step: context.step,
    };
  }
}

/**
 * Validate provisioning input
 */
function validateInput(input: ProvisioningInput, context: ProvisioningContext): void {
  const requiredFields = ['tenantId', 'domain', 'region'];
  const missing = requiredFields.filter((field) => !input[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Validate domain format
  if (!isValidDomain(input.domain)) {
    throw new Error(`Invalid domain format: ${input.domain}`);
  }

  // Validate region
  if (!isValidRegion(input.region)) {
    throw new Error(`Invalid AWS region: ${input.region}`);
  }
}

/**
 * Execute provisioning tasks
 */
async function executeProvisioning(
  input: ProvisioningInput,
  context: ProvisioningContext
): Promise<Record<string, unknown>> {
  const contextualLogger = new ContextualLogger(context);

  try {
    // Create tenant-specific stack name
    const stackName = `t3ck-tenant-${input.tenantId}`;

    contextualLogger.info('Executing provisioning', {
      stackName,
      action: input.action || 'apply',
    });

    // Prepare parameters for provisioning
    const parameters = {
      TenantId: input.tenantId,
      Domain: input.domain,
      CompanyName: input.companyName || 'Unknown',
      Region: input.region,
      ContactEmail: input.contactEmail || '',
      ContactPhone: input.contactPhone || '',
    };

    contextualLogger.info('Provisioning parameters prepared', {
      parameters: JSON.stringify(parameters),
    });

    // Simulate infrastructure provisioning delay
    await delay(2000);

    const result = {
      stackName,
      tenantId: input.tenantId,
      status: 'PROVISIONING_STARTED',
      timestamp: new Date().toISOString(),
      parameters,
    };

    contextualLogger.info('Infrastructure provisioning initiated', result);

    return result;
  } catch (error) {
    contextualLogger.error('Provisioning execution failed', error);
    throw error;
  }
}

/**
 * Destroy provisioning resources (cleanup)
 */
async function destroyProvisioning(
  input: ProvisioningInput,
  context: ProvisioningContext
): Promise<Record<string, unknown>> {
  const contextualLogger = new ContextualLogger(context);

  try {
    const stackName = `t3ck-tenant-${input.tenantId}`;

    contextualLogger.info('Executing resource destruction', { stackName });

    // Simulate resource cleanup delay
    await delay(1000);

    const result = {
      stackName,
      tenantId: input.tenantId,
      status: 'DESTRUCTION_INITIATED',
      timestamp: new Date().toISOString(),
    };

    contextualLogger.info('Resource destruction initiated', result);

    return result;
  } catch (error) {
    contextualLogger.error('Destruction execution failed', error);
    throw error;
  }
}

/**
 * AWS Lambda handler for provisioning requests
 * Accepts both direct invocations and Step Functions integration
 */
export const handler: Handler = async (
  event: ProvisioningInput | SQSEvent,
  lambdaContext: Context
): Promise<Record<string, unknown>> => {
  // Extract provisioning input
  let input: ProvisioningInput;

  if ('Records' in event) {
    // SQS event
    const sqsEvent = event as SQSEvent;
    try {
      input = JSON.parse(sqsEvent.Records[0].body);
    } catch (error) {
      logger.error('Failed to parse SQS message', { error });
      throw new Error('Invalid SQS message format');
    }
  } else {
    // Direct invocation from Step Functions
    input = event as ProvisioningInput;
  }

  // Create provisioning context for structured logging
  const provisioningContext: ProvisioningContext = {
    tenantId: input.tenantId,
    step: 'provisioning',
    action: input.action || 'apply',
    startTime: Date.now(),
  };

  // Set Lambda timeout context
  lambdaContext.getRemainingTimeInMillis();

  try {
    const result = await orchestrateProvisioning(input, provisioningContext);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const errorData = error instanceof Error ? {
      statusCode: 500,
      errorCode: error.name,
      errorMessage: error.message,
    } : error;

    logger.error('Handler execution failed', {
      error: errorData,
      context: provisioningContext,
    });

    return {
      statusCode: 500,
      body: JSON.stringify(errorData),
    };
  }
};

/**
 * Utility function: Validate domain format
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

/**
 * Utility function: Validate AWS region
 */
function isValidRegion(region: string): boolean {
  const validRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2',
  ];
  return validRegions.includes(region);
}

/**
 * Utility function: Delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}