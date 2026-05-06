import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctions_tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Interface for the provisioning form input
 */
export interface ProvisioningInput {
  tenantId: string;
  domain: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  region: string;
}

/**
 * Props for the ProvisioningStateMachine construct
 */
export interface ProvisioningStateMachineProps {
  terraformLambda: lambda.IFunction;
  cdkLambda: lambda.IFunction;
  firebaseConfigLambda: lambda.IFunction;
  route53ConfigLambda: lambda.IFunction;
  healthCheckLambda: lambda.IFunction;
}

/**
 * AWS Step Functions State Machine for T3CK provisioning workflow
 *
 * This state machine orchestrates the complete provisioning process for new tenants:
 * 1. Validates input and starts provisioning
 * 2. Executes Terraform for infrastructure setup
 * 3. Executes CDK for application deployment
 * 4. Configures Firebase for the new tenant
 * 5. Sets up Route53 DNS records
 * 6. Performs health checks to verify all services
 * 7. Sends notifications on success or failure
 * 8. Handles errors with DLQ for failed jobs
 */
export class ProvisioningStateMachine extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;
  public readonly dlqQueue: sqs.Queue;
  public readonly successTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ProvisioningStateMachineProps) {
    super(scope, id);

    // Create DLQ for failed provisioning jobs
    this.dlqQueue = new sqs.Queue(this, 'ProvisioningDLQ', {
      queueName: 't3ck-provisioning-dlq',
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true,
    });

    // Create SNS topic for success notifications
    this.successTopic = new sns.Topic(this, 'ProvisioningSuccessTopic', {
      topicName: 't3ck-provisioning-success',
      displayName: 'T3CK Provisioning Success Notifications',
      fifo: false,
    });

    // Create SNS topic for failure notifications
    const failureTopic = new sns.Topic(this, 'ProvisioningFailureTopic', {
      topicName: 't3ck-provisioning-failure',
      displayName: 'T3CK Provisioning Failure Notifications',
      fifo: false,
    });

    // Retry policy configuration
    const retryPolicy = {
      interval: cdk.Duration.seconds(2),
      backoffRate: 2.0,
      maxAttempts: 3,
    };

    // ============================================================================
    // START STATE - Entry point for provisioning workflow
    // ============================================================================
    const startState = new stepfunctions.Pass(this, 'StartProvisioning', {
      comment: 'Begin provisioning workflow - validate input and initialize',
      resultPath: '$.provisioningState',
      result: stepfunctions.Result.fromObject({
        status: 'STARTED',
        startTime: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
        retryCount: 0,
      }),
    });

    // ============================================================================
    // TERRAFORM EXECUTION STATE - Run Terraform for infrastructure
    // ============================================================================
    const terraformExecutionState = new stepfunctions_tasks.LambdaInvoke(
      this,
      'TerraformExecution',
      {
        lambda: props.terraformLambda,
        outputPath: '$.terraformResult',
        resultPath: '$.terraformResult',
        comment: 'Execute Terraform to provision cloud infrastructure for tenant',
        retryOnServiceExceptions: true,
        payload: stepfunctions.TaskInput.fromObject({
          tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
          domain: stepfunctions.JsonPath.stringAt('$.domain'),
          region: stepfunctions.JsonPath.stringAt('$.region'),
          action: 'apply',
        }),
      }
    );

    // Add retry policy with exponential backoff
    terraformExecutionState.addRetry({
      errors: ['States.TaskFailed', 'States.Timeout'],
      interval: retryPolicy.interval,
      backoffRate: retryPolicy.backoffRate,
      maxAttempts: retryPolicy.maxAttempts,
    });

    // ============================================================================
    // CDK EXECUTION STATE - Deploy CDK stacks
    // ============================================================================
    const cdkExecutionState = new stepfunctions_tasks.LambdaInvoke(this, 'CDKExecution', {
      lambda: props.cdkLambda,
      outputPath: '$.cdkResult',
      resultPath: '$.cdkResult',
      comment: 'Execute CDK deployment for application infrastructure',
      retryOnServiceExceptions: true,
      payload: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        companyName: stepfunctions.JsonPath.stringAt('$.companyName'),
        region: stepfunctions.JsonPath.stringAt('$.region'),
        action: 'deploy',
      }),
    });

    cdkExecutionState.addRetry({
      errors: ['States.TaskFailed', 'States.Timeout'],
      interval: retryPolicy.interval,
      backoffRate: retryPolicy.backoffRate,
      maxAttempts: retryPolicy.maxAttempts,
    });

    // ============================================================================
    // FIREBASE SETUP STATE - Configure Firebase for new tenant
    // ============================================================================
    const firebaseSetupState = new stepfunctions_tasks.LambdaInvoke(this, 'FirebaseSetup', {
      lambda: props.firebaseConfigLambda,
      outputPath: '$.firebaseResult',
      resultPath: '$.firebaseResult',
      comment: 'Configure Firebase project and Firestore for new tenant',
      retryOnServiceExceptions: true,
      payload: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        projectId: stepfunctions.JsonPath.stringAt('$.firebaseProjectId'),
      }),
    });

    firebaseSetupState.addRetry({
      errors: ['States.TaskFailed', 'States.Timeout'],
      interval: retryPolicy.interval,
      backoffRate: retryPolicy.backoffRate,
      maxAttempts: retryPolicy.maxAttempts,
    });

    // ============================================================================
    // ROUTE53 CONFIGURATION STATE - Setup DNS records
    // ============================================================================
    const route53ConfigState = new stepfunctions_tasks.LambdaInvoke(this, 'Route53Configuration', {
      lambda: props.route53ConfigLambda,
      outputPath: '$.route53Result',
      resultPath: '$.route53Result',
      comment: 'Configure Route53 DNS records for tenant domain',
      retryOnServiceExceptions: true,
      payload: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        hostedZoneId: stepfunctions.JsonPath.stringAt('$.hostedZoneId'),
        region: stepfunctions.JsonPath.stringAt('$.region'),
      }),
    });

    route53ConfigState.addRetry({
      errors: ['States.TaskFailed', 'States.Timeout'],
      interval: retryPolicy.interval,
      backoffRate: retryPolicy.backoffRate,
      maxAttempts: retryPolicy.maxAttempts,
    });

    // ============================================================================
    // HEALTH CHECK STATE - Verify all services are healthy with retry loop
    // ============================================================================
    const healthCheckState = new stepfunctions_tasks.LambdaInvoke(this, 'HealthCheck', {
      lambda: props.healthCheckLambda,
      outputPath: '$.healthCheckResult',
      resultPath: '$.healthCheckResult',
      comment: 'Verify all provisioned services are healthy and operational',
      retryOnServiceExceptions: true,
      payload: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        region: stepfunctions.JsonPath.stringAt('$.region'),
        maxRetries: 10,
        delaySeconds: 30,
      }),
    });

    healthCheckState.addRetry({
      errors: ['States.TaskFailed', 'HealthCheckFailed'],
      interval: cdk.Duration.seconds(30),
      backoffRate: 1.0,
      maxAttempts: 10,
    });

    // ============================================================================
    // SUCCESS NOTIFICATION STATE - Send SNS notification on success
    // ============================================================================
    const notifySuccessState = new stepfunctions_tasks.SnsPublish(this, 'NotifySuccess', {
      topic: this.successTopic,
      message: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        companyName: stepfunctions.JsonPath.stringAt('$.companyName'),
        status: 'PROVISIONING_COMPLETED',
        timestamp: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
        contactEmail: stepfunctions.JsonPath.stringAt('$.contactEmail'),
      }),
      subject: stepfunctions.JsonPath.stringAt('$.companyName + " - Provisioning Complete"'),
      resultPath: stepfunctions.JsonPath.DISCARD,
    });

    // ============================================================================
    // SUCCESS END STATE - Mark provisioning as complete
    // ============================================================================
    const successEndState = new stepfunctions.Succeed(this, 'ProvisioningSuccess', {
      comment: 'Provisioning completed successfully',
    });

    // ============================================================================
    // FAILURE HANDLING - Send to DLQ and notify failure
    // ============================================================================
    const sendToDLQState = new stepfunctions_tasks.SqsSendMessage(this, 'SendFailureToDLQ', {
      queue: this.dlqQueue,
      messageBody: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        status: 'PROVISIONING_FAILED',
        error: stepfunctions.JsonPath.stringAt('$.errorMessage'),
        errorCode: stepfunctions.JsonPath.stringAt('$.errorCode'),
        timestamp: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
        executionArn: stepfunctions.JsonPath.stringAt('$$.Execution.Arn'),
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
    });

    // ============================================================================
    // FAILURE NOTIFICATION STATE - Send SNS notification on failure
    // ============================================================================
    const notifyFailureState = new stepfunctions_tasks.SnsPublish(this, 'NotifyFailure', {
      topic: failureTopic,
      message: stepfunctions.TaskInput.fromObject({
        tenantId: stepfunctions.JsonPath.stringAt('$.tenantId'),
        domain: stepfunctions.JsonPath.stringAt('$.domain'),
        companyName: stepfunctions.JsonPath.stringAt('$.companyName'),
        status: 'PROVISIONING_FAILED',
        error: stepfunctions.JsonPath.stringAt('$.errorMessage'),
        contactEmail: stepfunctions.JsonPath.stringAt('$.contactEmail'),
        timestamp: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
      }),
      subject: stepfunctions.JsonPath.stringAt('$.companyName + " - Provisioning Failed"'),
      resultPath: stepfunctions.JsonPath.DISCARD,
    });

    // ============================================================================
    // FAILURE END STATE - Mark provisioning as failed
    // ============================================================================
    const failureEndState = new stepfunctions.Fail(this, 'ProvisioningFailed', {
      comment: 'Provisioning failed - check DLQ and notifications',
      error: stepfunctions.JsonPath.stringAt('$.errorCode'),
      cause: stepfunctions.JsonPath.stringAt('$.errorMessage'),
    });

    // ============================================================================
    // CHAIN WORKFLOW TOGETHER
    // ============================================================================
    // Main provisioning chain - execute states sequentially
    const chain = stepfunctions.Chain.start(startState)
      .next(terraformExecutionState)
      .next(cdkExecutionState)
      .next(firebaseSetupState)
      .next(route53ConfigState)
      .next(healthCheckState)
      .next(notifySuccessState)
      .next(successEndState);

    // Add catch handler for any errors in the chain
    chain.addCatch(
      stepfunctions.Chain.start(sendToDLQState).next(notifyFailureState).next(failureEndState),
      {
        errors: ['States.ALL'],
        resultPath: '$.error',
      }
    );

    // ============================================================================
    // CREATE STATE MACHINE
    // ============================================================================
    this.stateMachine = new stepfunctions.StateMachine(this, 'ProvisioningStateMachine', {
      definition: chain,
      stateMachineType: stepfunctions.StateMachineType.STANDARD,
      stateMachineName: 't3ck-provisioning-workflow',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      logs: new stepfunctions.LogOptions({
        destination: new logs.LogGroup(this, 'ProvisioningStateMachineLog', {
          logGroupName: '/aws/stepfunctions/t3ck-provisioning',
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      }),
    });
  }
}
