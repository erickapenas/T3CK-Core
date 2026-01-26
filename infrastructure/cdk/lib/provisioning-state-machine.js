"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvisioningStateMachine = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const stepfunctions = __importStar(require("aws-cdk-lib/aws-stepfunctions"));
const stepfunctions_tasks = __importStar(require("aws-cdk-lib/aws-stepfunctions-tasks"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
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
class ProvisioningStateMachine extends constructs_1.Construct {
    stateMachine;
    dlqQueue;
    successTopic;
    constructor(scope, id, props) {
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
        const terraformExecutionState = new stepfunctions_tasks.LambdaInvoke(this, 'TerraformExecution', {
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
        });
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
        chain.addCatch(stepfunctions.Chain.start(sendToDLQState)
            .next(notifyFailureState)
            .next(failureEndState), {
            errors: ['States.ALL'],
            resultPath: '$.error',
        });
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
exports.ProvisioningStateMachine = ProvisioningStateMachine;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlzaW9uaW5nLXN0YXRlLW1hY2hpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwcm92aXNpb25pbmctc3RhdGUtbWFjaGluZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkVBQStEO0FBQy9ELHlGQUEyRTtBQUUzRSx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3QywyQ0FBdUM7QUF5QnZDOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQWEsd0JBQXlCLFNBQVEsc0JBQVM7SUFDckMsWUFBWSxDQUE2QjtJQUN6QyxRQUFRLENBQVk7SUFDcEIsWUFBWSxDQUFZO0lBRXhDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3JELFNBQVMsRUFBRSx1QkFBdUI7WUFDbEMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxVQUFVLEVBQUUsSUFBSTtTQUNqQixDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2xFLFNBQVMsRUFBRSwyQkFBMkI7WUFDdEMsV0FBVyxFQUFFLHlDQUF5QztZQUN0RCxJQUFJLEVBQUUsS0FBSztTQUNaLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ25FLFNBQVMs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QUMsUUFBUSxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtvQkFDbEUsWUFBWSxFQUFFLHNDQUFzQztvQkFDcEQsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtvQkFDdEMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztpQkFDekMsQ0FBQztnQkFDRixLQUFLLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHO2dCQUNqQyxvQkFBb0IsRUFBRSxJQUFJO2FBQzNCLENBQUM7U0FDSCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5VEQsNERBOFRDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgc3RlcGZ1bmN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3RlcGZ1bmN0aW9ucyc7XHJcbmltcG9ydCAqIGFzIHN0ZXBmdW5jdGlvbnNfdGFza3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLXN0ZXBmdW5jdGlvbnMtdGFza3MnO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcclxuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xyXG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG4vKipcclxuICogSW50ZXJmYWNlIGZvciB0aGUgcHJvdmlzaW9uaW5nIGZvcm0gaW5wdXRcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUHJvdmlzaW9uaW5nSW5wdXQge1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgZG9tYWluOiBzdHJpbmc7XHJcbiAgY29tcGFueU5hbWU6IHN0cmluZztcclxuICBjb250YWN0RW1haWw6IHN0cmluZztcclxuICBjb250YWN0UGhvbmU6IHN0cmluZztcclxuICByZWdpb246IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIFByb3BzIGZvciB0aGUgUHJvdmlzaW9uaW5nU3RhdGVNYWNoaW5lIGNvbnN0cnVjdFxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBQcm92aXNpb25pbmdTdGF0ZU1hY2hpbmVQcm9wcyB7XHJcbiAgdGVycmFmb3JtTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGNka0xhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICBmaXJlYmFzZUNvbmZpZ0xhbWJkYTogbGFtYmRhLklGdW5jdGlvbjtcclxuICByb3V0ZTUzQ29uZmlnTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG4gIGhlYWx0aENoZWNrTGFtYmRhOiBsYW1iZGEuSUZ1bmN0aW9uO1xyXG59XHJcblxyXG4vKipcclxuICogQVdTIFN0ZXAgRnVuY3Rpb25zIFN0YXRlIE1hY2hpbmUgZm9yIFQzQ0sgcHJvdmlzaW9uaW5nIHdvcmtmbG93XHJcbiAqXHJcbiAqIFRoaXMgc3RhdGUgbWFjaGluZSBvcmNoZXN0cmF0ZXMgdGhlIGNvbXBsZXRlIHByb3Zpc2lvbmluZyBwcm9jZXNzIGZvciBuZXcgdGVuYW50czpcclxuICogMS4gVmFsaWRhdGVzIGlucHV0IGFuZCBzdGFydHMgcHJvdmlzaW9uaW5nXHJcbiAqIDIuIEV4ZWN1dGVzIFRlcnJhZm9ybSBmb3IgaW5mcmFzdHJ1Y3R1cmUgc2V0dXBcclxuICogMy4gRXhlY3V0ZXMgQ0RLIGZvciBhcHBsaWNhdGlvbiBkZXBsb3ltZW50XHJcbiAqIDQuIENvbmZpZ3VyZXMgRmlyZWJhc2UgZm9yIHRoZSBuZXcgdGVuYW50XHJcbiAqIDUuIFNldHMgdXAgUm91dGU1MyBETlMgcmVjb3Jkc1xyXG4gKiA2LiBQZXJmb3JtcyBoZWFsdGggY2hlY2tzIHRvIHZlcmlmeSBhbGwgc2VydmljZXNcclxuICogNy4gU2VuZHMgbm90aWZpY2F0aW9ucyBvbiBzdWNjZXNzIG9yIGZhaWx1cmVcclxuICogOC4gSGFuZGxlcyBlcnJvcnMgd2l0aCBETFEgZm9yIGZhaWxlZCBqb2JzXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgUHJvdmlzaW9uaW5nU3RhdGVNYWNoaW5lIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgc3RhdGVNYWNoaW5lOiBzdGVwZnVuY3Rpb25zLlN0YXRlTWFjaGluZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgZGxxUXVldWU6IHNxcy5RdWV1ZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgc3VjY2Vzc1RvcGljOiBzbnMuVG9waWM7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQcm92aXNpb25pbmdTdGF0ZU1hY2hpbmVQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRExRIGZvciBmYWlsZWQgcHJvdmlzaW9uaW5nIGpvYnNcclxuICAgIHRoaXMuZGxxUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm92aXNpb25pbmdETFEnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogJ3QzY2stcHJvdmlzaW9uaW5nLWRscScsXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxyXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFNOUyB0b3BpYyBmb3Igc3VjY2VzcyBub3RpZmljYXRpb25zXHJcbiAgICB0aGlzLnN1Y2Nlc3NUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ1Byb3Zpc2lvbmluZ1N1Y2Nlc3NUb3BpYycsIHtcclxuICAgICAgdG9waWNOYW1lOiAndDNjay1wcm92aXNpb25pbmctc3VjY2VzcycsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnVDNDSyBQcm92aXNpb25pbmcgU3VjY2VzcyBOb3RpZmljYXRpb25zJyxcclxuICAgICAgZmlmbzogZmFsc2UsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBmYWlsdXJlIG5vdGlmaWNhdGlvbnNcclxuICAgIGNvbnN0IGZhaWx1cmVUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ1Byb3Zpc2lvbmluZ0ZhaWx1cmVUb3BpYycsIHtcclxuICAgICAgdG9waWNOYW1lOiAndDNjay1wcm92aXNpb25pbmctZmFpbHVyZScsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnVDNDSyBQcm92aXNpb25pbmcgRmFpbHVyZSBOb3RpZmljYXRpb25zJyxcclxuICAgICAgZmlmbzogZmFsc2UsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZXRyeSBwb2xpY3kgY29uZmlndXJhdGlvblxyXG4gICAgY29uc3QgcmV0cnlQb2xpY3kgPSB7XHJcbiAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygyKSxcclxuICAgICAgYmFja29mZlJhdGU6IDIuMCxcclxuICAgICAgbWF4QXR0ZW1wdHM6IDMsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIFNUQVJUIFNUQVRFIC0gRW50cnkgcG9pbnQgZm9yIHByb3Zpc2lvbmluZyB3b3JrZmxvd1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgY29uc3Qgc3RhcnRTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zLlBhc3ModGhpcywgJ1N0YXJ0UHJvdmlzaW9uaW5nJywge1xyXG4gICAgICBjb21tZW50OiAnQmVnaW4gcHJvdmlzaW9uaW5nIHdvcmtmbG93IC0gdmFsaWRhdGUgaW5wdXQgYW5kIGluaXRpYWxpemUnLFxyXG4gICAgICByZXN1bHRQYXRoOiAnJC5wcm92aXNpb25pbmdTdGF0ZScsXHJcbiAgICAgIHJlc3VsdDogc3RlcGZ1bmN0aW9ucy5SZXN1bHQuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgc3RhdHVzOiAnU1RBUlRFRCcsXHJcbiAgICAgICAgc3RhcnRUaW1lOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5TdGF0ZS5FbnRlcmVkVGltZScpLFxyXG4gICAgICAgIHJldHJ5Q291bnQ6IDAsXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gVEVSUkFGT1JNIEVYRUNVVElPTiBTVEFURSAtIFJ1biBUZXJyYWZvcm0gZm9yIGluZnJhc3RydWN0dXJlXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCB0ZXJyYWZvcm1FeGVjdXRpb25TdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zX3Rhc2tzLkxhbWJkYUludm9rZShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ1RlcnJhZm9ybUV4ZWN1dGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBsYW1iZGE6IHByb3BzLnRlcnJhZm9ybUxhbWJkYSxcclxuICAgICAgICBvdXRwdXRQYXRoOiAnJC50ZXJyYWZvcm1SZXN1bHQnLFxyXG4gICAgICAgIHJlc3VsdFBhdGg6ICckLnRlcnJhZm9ybVJlc3VsdCcsXHJcbiAgICAgICAgY29tbWVudDogJ0V4ZWN1dGUgVGVycmFmb3JtIHRvIHByb3Zpc2lvbiBjbG91ZCBpbmZyYXN0cnVjdHVyZSBmb3IgdGVuYW50JyxcclxuICAgICAgICByZXRyeU9uU2VydmljZUV4Y2VwdGlvbnM6IHRydWUsXHJcbiAgICAgICAgcGF5bG9hZDogc3RlcGZ1bmN0aW9ucy5UYXNrSW5wdXQuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgICB0ZW5hbnRJZDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC50ZW5hbnRJZCcpLFxyXG4gICAgICAgICAgZG9tYWluOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmRvbWFpbicpLFxyXG4gICAgICAgICAgcmVnaW9uOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLnJlZ2lvbicpLFxyXG4gICAgICAgICAgYWN0aW9uOiAnYXBwbHknLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIEFkZCByZXRyeSBwb2xpY3kgd2l0aCBleHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICB0ZXJyYWZvcm1FeGVjdXRpb25TdGF0ZS5hZGRSZXRyeSh7XHJcbiAgICAgIGVycm9yczogWydTdGF0ZXMuVGFza0ZhaWxlZCcsICdTdGF0ZXMuVGltZW91dCddLFxyXG4gICAgICBpbnRlcnZhbDogcmV0cnlQb2xpY3kuaW50ZXJ2YWwsXHJcbiAgICAgIGJhY2tvZmZSYXRlOiByZXRyeVBvbGljeS5iYWNrb2ZmUmF0ZSxcclxuICAgICAgbWF4QXR0ZW1wdHM6IHJldHJ5UG9saWN5Lm1heEF0dGVtcHRzLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gQ0RLIEVYRUNVVElPTiBTVEFURSAtIERlcGxveSBDREsgc3RhY2tzXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCBjZGtFeGVjdXRpb25TdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zX3Rhc2tzLkxhbWJkYUludm9rZShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0NES0V4ZWN1dGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBsYW1iZGE6IHByb3BzLmNka0xhbWJkYSxcclxuICAgICAgICBvdXRwdXRQYXRoOiAnJC5jZGtSZXN1bHQnLFxyXG4gICAgICAgIHJlc3VsdFBhdGg6ICckLmNka1Jlc3VsdCcsXHJcbiAgICAgICAgY29tbWVudDogJ0V4ZWN1dGUgQ0RLIGRlcGxveW1lbnQgZm9yIGFwcGxpY2F0aW9uIGluZnJhc3RydWN0dXJlJyxcclxuICAgICAgICByZXRyeU9uU2VydmljZUV4Y2VwdGlvbnM6IHRydWUsXHJcbiAgICAgICAgcGF5bG9hZDogc3RlcGZ1bmN0aW9ucy5UYXNrSW5wdXQuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgICB0ZW5hbnRJZDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC50ZW5hbnRJZCcpLFxyXG4gICAgICAgICAgZG9tYWluOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmRvbWFpbicpLFxyXG4gICAgICAgICAgY29tcGFueU5hbWU6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuY29tcGFueU5hbWUnKSxcclxuICAgICAgICAgIHJlZ2lvbjogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC5yZWdpb24nKSxcclxuICAgICAgICAgIGFjdGlvbjogJ2RlcGxveScsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgY2RrRXhlY3V0aW9uU3RhdGUuYWRkUmV0cnkoe1xyXG4gICAgICBlcnJvcnM6IFsnU3RhdGVzLlRhc2tGYWlsZWQnLCAnU3RhdGVzLlRpbWVvdXQnXSxcclxuICAgICAgaW50ZXJ2YWw6IHJldHJ5UG9saWN5LmludGVydmFsLFxyXG4gICAgICBiYWNrb2ZmUmF0ZTogcmV0cnlQb2xpY3kuYmFja29mZlJhdGUsXHJcbiAgICAgIG1heEF0dGVtcHRzOiByZXRyeVBvbGljeS5tYXhBdHRlbXB0cyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIEZJUkVCQVNFIFNFVFVQIFNUQVRFIC0gQ29uZmlndXJlIEZpcmViYXNlIGZvciBuZXcgdGVuYW50XHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCBmaXJlYmFzZVNldHVwU3RhdGUgPSBuZXcgc3RlcGZ1bmN0aW9uc190YXNrcy5MYW1iZGFJbnZva2UoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdGaXJlYmFzZVNldHVwJyxcclxuICAgICAge1xyXG4gICAgICAgIGxhbWJkYTogcHJvcHMuZmlyZWJhc2VDb25maWdMYW1iZGEsXHJcbiAgICAgICAgb3V0cHV0UGF0aDogJyQuZmlyZWJhc2VSZXN1bHQnLFxyXG4gICAgICAgIHJlc3VsdFBhdGg6ICckLmZpcmViYXNlUmVzdWx0JyxcclxuICAgICAgICBjb21tZW50OiAnQ29uZmlndXJlIEZpcmViYXNlIHByb2plY3QgYW5kIEZpcmVzdG9yZSBmb3IgbmV3IHRlbmFudCcsXHJcbiAgICAgICAgcmV0cnlPblNlcnZpY2VFeGNlcHRpb25zOiB0cnVlLFxyXG4gICAgICAgIHBheWxvYWQ6IHN0ZXBmdW5jdGlvbnMuVGFza0lucHV0LmZyb21PYmplY3Qoe1xyXG4gICAgICAgICAgdGVuYW50SWQ6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQudGVuYW50SWQnKSxcclxuICAgICAgICAgIGRvbWFpbjogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC5kb21haW4nKSxcclxuICAgICAgICAgIHByb2plY3RJZDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC5maXJlYmFzZVByb2plY3RJZCcpLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGZpcmViYXNlU2V0dXBTdGF0ZS5hZGRSZXRyeSh7XHJcbiAgICAgIGVycm9yczogWydTdGF0ZXMuVGFza0ZhaWxlZCcsICdTdGF0ZXMuVGltZW91dCddLFxyXG4gICAgICBpbnRlcnZhbDogcmV0cnlQb2xpY3kuaW50ZXJ2YWwsXHJcbiAgICAgIGJhY2tvZmZSYXRlOiByZXRyeVBvbGljeS5iYWNrb2ZmUmF0ZSxcclxuICAgICAgbWF4QXR0ZW1wdHM6IHJldHJ5UG9saWN5Lm1heEF0dGVtcHRzLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gUk9VVEU1MyBDT05GSUdVUkFUSU9OIFNUQVRFIC0gU2V0dXAgRE5TIHJlY29yZHNcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIGNvbnN0IHJvdXRlNTNDb25maWdTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zX3Rhc2tzLkxhbWJkYUludm9rZShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ1JvdXRlNTNDb25maWd1cmF0aW9uJyxcclxuICAgICAge1xyXG4gICAgICAgIGxhbWJkYTogcHJvcHMucm91dGU1M0NvbmZpZ0xhbWJkYSxcclxuICAgICAgICBvdXRwdXRQYXRoOiAnJC5yb3V0ZTUzUmVzdWx0JyxcclxuICAgICAgICByZXN1bHRQYXRoOiAnJC5yb3V0ZTUzUmVzdWx0JyxcclxuICAgICAgICBjb21tZW50OiAnQ29uZmlndXJlIFJvdXRlNTMgRE5TIHJlY29yZHMgZm9yIHRlbmFudCBkb21haW4nLFxyXG4gICAgICAgIHJldHJ5T25TZXJ2aWNlRXhjZXB0aW9uczogdHJ1ZSxcclxuICAgICAgICBwYXlsb2FkOiBzdGVwZnVuY3Rpb25zLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHtcclxuICAgICAgICAgIHRlbmFudElkOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLnRlbmFudElkJyksXHJcbiAgICAgICAgICBkb21haW46IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZG9tYWluJyksXHJcbiAgICAgICAgICBob3N0ZWRab25lSWQ6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuaG9zdGVkWm9uZUlkJyksXHJcbiAgICAgICAgICByZWdpb246IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQucmVnaW9uJyksXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgcm91dGU1M0NvbmZpZ1N0YXRlLmFkZFJldHJ5KHtcclxuICAgICAgZXJyb3JzOiBbJ1N0YXRlcy5UYXNrRmFpbGVkJywgJ1N0YXRlcy5UaW1lb3V0J10sXHJcbiAgICAgIGludGVydmFsOiByZXRyeVBvbGljeS5pbnRlcnZhbCxcclxuICAgICAgYmFja29mZlJhdGU6IHJldHJ5UG9saWN5LmJhY2tvZmZSYXRlLFxyXG4gICAgICBtYXhBdHRlbXB0czogcmV0cnlQb2xpY3kubWF4QXR0ZW1wdHMsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBIRUFMVEggQ0hFQ0sgU1RBVEUgLSBWZXJpZnkgYWxsIHNlcnZpY2VzIGFyZSBoZWFsdGh5IHdpdGggcmV0cnkgbG9vcFxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgY29uc3QgaGVhbHRoQ2hlY2tTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zX3Rhc2tzLkxhbWJkYUludm9rZShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ0hlYWx0aENoZWNrJyxcclxuICAgICAge1xyXG4gICAgICAgIGxhbWJkYTogcHJvcHMuaGVhbHRoQ2hlY2tMYW1iZGEsXHJcbiAgICAgICAgb3V0cHV0UGF0aDogJyQuaGVhbHRoQ2hlY2tSZXN1bHQnLFxyXG4gICAgICAgIHJlc3VsdFBhdGg6ICckLmhlYWx0aENoZWNrUmVzdWx0JyxcclxuICAgICAgICBjb21tZW50OiAnVmVyaWZ5IGFsbCBwcm92aXNpb25lZCBzZXJ2aWNlcyBhcmUgaGVhbHRoeSBhbmQgb3BlcmF0aW9uYWwnLFxyXG4gICAgICAgIHJldHJ5T25TZXJ2aWNlRXhjZXB0aW9uczogdHJ1ZSxcclxuICAgICAgICBwYXlsb2FkOiBzdGVwZnVuY3Rpb25zLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHtcclxuICAgICAgICAgIHRlbmFudElkOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLnRlbmFudElkJyksXHJcbiAgICAgICAgICBkb21haW46IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZG9tYWluJyksXHJcbiAgICAgICAgICByZWdpb246IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQucmVnaW9uJyksXHJcbiAgICAgICAgICBtYXhSZXRyaWVzOiAxMCxcclxuICAgICAgICAgIGRlbGF5U2Vjb25kczogMzAsXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgaGVhbHRoQ2hlY2tTdGF0ZS5hZGRSZXRyeSh7XHJcbiAgICAgIGVycm9yczogWydTdGF0ZXMuVGFza0ZhaWxlZCcsICdIZWFsdGhDaGVja0ZhaWxlZCddLFxyXG4gICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBiYWNrb2ZmUmF0ZTogMS4wLFxyXG4gICAgICBtYXhBdHRlbXB0czogMTAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBTVUNDRVNTIE5PVElGSUNBVElPTiBTVEFURSAtIFNlbmQgU05TIG5vdGlmaWNhdGlvbiBvbiBzdWNjZXNzXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCBub3RpZnlTdWNjZXNzU3RhdGUgPSBuZXcgc3RlcGZ1bmN0aW9uc190YXNrcy5TbnNQdWJsaXNoKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnTm90aWZ5U3VjY2VzcycsXHJcbiAgICAgIHtcclxuICAgICAgICB0b3BpYzogdGhpcy5zdWNjZXNzVG9waWMsXHJcbiAgICAgICAgbWVzc2FnZTogc3RlcGZ1bmN0aW9ucy5UYXNrSW5wdXQuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgICB0ZW5hbnRJZDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC50ZW5hbnRJZCcpLFxyXG4gICAgICAgICAgZG9tYWluOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmRvbWFpbicpLFxyXG4gICAgICAgICAgY29tcGFueU5hbWU6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuY29tcGFueU5hbWUnKSxcclxuICAgICAgICAgIHN0YXR1czogJ1BST1ZJU0lPTklOR19DT01QTEVURUQnLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5TdGF0ZS5FbnRlcmVkVGltZScpLFxyXG4gICAgICAgICAgY29udGFjdEVtYWlsOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmNvbnRhY3RFbWFpbCcpLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHN1YmplY3Q6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoXHJcbiAgICAgICAgICAnJC5jb21wYW55TmFtZSArIFwiIC0gUHJvdmlzaW9uaW5nIENvbXBsZXRlXCInXHJcbiAgICAgICAgKSxcclxuICAgICAgICByZXN1bHRQYXRoOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLkRJU0NBUkQsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gU1VDQ0VTUyBFTkQgU1RBVEUgLSBNYXJrIHByb3Zpc2lvbmluZyBhcyBjb21wbGV0ZVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgY29uc3Qgc3VjY2Vzc0VuZFN0YXRlID0gbmV3IHN0ZXBmdW5jdGlvbnMuU3VjY2VlZCh0aGlzLCAnUHJvdmlzaW9uaW5nU3VjY2VzcycsIHtcclxuICAgICAgY29tbWVudDogJ1Byb3Zpc2lvbmluZyBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5JyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIEZBSUxVUkUgSEFORExJTkcgLSBTZW5kIHRvIERMUSBhbmQgbm90aWZ5IGZhaWx1cmVcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIGNvbnN0IHNlbmRUb0RMUVN0YXRlID0gbmV3IHN0ZXBmdW5jdGlvbnNfdGFza3MuU3FzU2VuZE1lc3NhZ2UoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdTZW5kRmFpbHVyZVRvRExRJyxcclxuICAgICAge1xyXG4gICAgICAgIHF1ZXVlOiB0aGlzLmRscVF1ZXVlLFxyXG4gICAgICAgIG1lc3NhZ2VCb2R5OiBzdGVwZnVuY3Rpb25zLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHtcclxuICAgICAgICAgIHRlbmFudElkOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLnRlbmFudElkJyksXHJcbiAgICAgICAgICBkb21haW46IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZG9tYWluJyksXHJcbiAgICAgICAgICBzdGF0dXM6ICdQUk9WSVNJT05JTkdfRkFJTEVEJyxcclxuICAgICAgICAgIGVycm9yOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmVycm9yTWVzc2FnZScpLFxyXG4gICAgICAgICAgZXJyb3JDb2RlOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmVycm9yQ29kZScpLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5TdGF0ZS5FbnRlcmVkVGltZScpLFxyXG4gICAgICAgICAgZXhlY3V0aW9uQXJuOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5FeGVjdXRpb24uQXJuJyksXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgcmVzdWx0UGF0aDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5ESVNDQVJELFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIEZBSUxVUkUgTk9USUZJQ0FUSU9OIFNUQVRFIC0gU2VuZCBTTlMgbm90aWZpY2F0aW9uIG9uIGZhaWx1cmVcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIGNvbnN0IG5vdGlmeUZhaWx1cmVTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zX3Rhc2tzLlNuc1B1Ymxpc2goXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdOb3RpZnlGYWlsdXJlJyxcclxuICAgICAge1xyXG4gICAgICAgIHRvcGljOiBmYWlsdXJlVG9waWMsXHJcbiAgICAgICAgbWVzc2FnZTogc3RlcGZ1bmN0aW9ucy5UYXNrSW5wdXQuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgICB0ZW5hbnRJZDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC50ZW5hbnRJZCcpLFxyXG4gICAgICAgICAgZG9tYWluOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckLmRvbWFpbicpLFxyXG4gICAgICAgICAgY29tcGFueU5hbWU6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuY29tcGFueU5hbWUnKSxcclxuICAgICAgICAgIHN0YXR1czogJ1BST1ZJU0lPTklOR19GQUlMRUQnLFxyXG4gICAgICAgICAgZXJyb3I6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZXJyb3JNZXNzYWdlJyksXHJcbiAgICAgICAgICBjb250YWN0RW1haWw6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuY29udGFjdEVtYWlsJyksXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQkLlN0YXRlLkVudGVyZWRUaW1lJyksXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgc3ViamVjdDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdChcclxuICAgICAgICAgICckLmNvbXBhbnlOYW1lICsgXCIgLSBQcm92aXNpb25pbmcgRmFpbGVkXCInXHJcbiAgICAgICAgKSxcclxuICAgICAgICByZXN1bHRQYXRoOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLkRJU0NBUkQsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gRkFJTFVSRSBFTkQgU1RBVEUgLSBNYXJrIHByb3Zpc2lvbmluZyBhcyBmYWlsZWRcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIGNvbnN0IGZhaWx1cmVFbmRTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zLkZhaWwodGhpcywgJ1Byb3Zpc2lvbmluZ0ZhaWxlZCcsIHtcclxuICAgICAgY29tbWVudDogJ1Byb3Zpc2lvbmluZyBmYWlsZWQgLSBjaGVjayBETFEgYW5kIG5vdGlmaWNhdGlvbnMnLFxyXG4gICAgICBlcnJvcjogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC5lcnJvckNvZGUnKSxcclxuICAgICAgY2F1c2U6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZXJyb3JNZXNzYWdlJyksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDSEFJTiBXT1JLRkxPVyBUT0dFVEhFUlxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gTWFpbiBwcm92aXNpb25pbmcgY2hhaW4gLSBleGVjdXRlIHN0YXRlcyBzZXF1ZW50aWFsbHlcclxuICAgIGNvbnN0IGNoYWluID0gc3RlcGZ1bmN0aW9ucy5DaGFpbi5zdGFydChzdGFydFN0YXRlKVxyXG4gICAgICAubmV4dCh0ZXJyYWZvcm1FeGVjdXRpb25TdGF0ZSlcclxuICAgICAgLm5leHQoY2RrRXhlY3V0aW9uU3RhdGUpXHJcbiAgICAgIC5uZXh0KGZpcmViYXNlU2V0dXBTdGF0ZSlcclxuICAgICAgLm5leHQocm91dGU1M0NvbmZpZ1N0YXRlKVxyXG4gICAgICAubmV4dChoZWFsdGhDaGVja1N0YXRlKVxyXG4gICAgICAubmV4dChub3RpZnlTdWNjZXNzU3RhdGUpXHJcbiAgICAgIC5uZXh0KHN1Y2Nlc3NFbmRTdGF0ZSk7XHJcblxyXG4gICAgLy8gQWRkIGNhdGNoIGhhbmRsZXIgZm9yIGFueSBlcnJvcnMgaW4gdGhlIGNoYWluXHJcbiAgICBjaGFpbi5hZGRDYXRjaChcclxuICAgICAgc3RlcGZ1bmN0aW9ucy5DaGFpbi5zdGFydChzZW5kVG9ETFFTdGF0ZSlcclxuICAgICAgICAubmV4dChub3RpZnlGYWlsdXJlU3RhdGUpXHJcbiAgICAgICAgLm5leHQoZmFpbHVyZUVuZFN0YXRlKSxcclxuICAgICAge1xyXG4gICAgICAgIGVycm9yczogWydTdGF0ZXMuQUxMJ10sXHJcbiAgICAgICAgcmVzdWx0UGF0aDogJyQuZXJyb3InLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIENSRUFURSBTVEFURSBNQUNISU5FXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLnN0YXRlTWFjaGluZSA9IG5ldyBzdGVwZnVuY3Rpb25zLlN0YXRlTWFjaGluZSh0aGlzLCAnUHJvdmlzaW9uaW5nU3RhdGVNYWNoaW5lJywge1xyXG4gICAgICBkZWZpbml0aW9uOiBjaGFpbixcclxuICAgICAgc3RhdGVNYWNoaW5lVHlwZTogc3RlcGZ1bmN0aW9ucy5TdGF0ZU1hY2hpbmVUeXBlLlNUQU5EQVJELFxyXG4gICAgICBzdGF0ZU1hY2hpbmVOYW1lOiAndDNjay1wcm92aXNpb25pbmctd29ya2Zsb3cnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICBsb2dzOiBuZXcgc3RlcGZ1bmN0aW9ucy5Mb2dPcHRpb25zKHtcclxuICAgICAgICBkZXN0aW5hdGlvbjogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1Byb3Zpc2lvbmluZ1N0YXRlTWFjaGluZUxvZycsIHtcclxuICAgICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3Mvc3RlcGZ1bmN0aW9ucy90M2NrLXByb3Zpc2lvbmluZycsXHJcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgbGV2ZWw6IHN0ZXBmdW5jdGlvbnMuTG9nTGV2ZWwuQUxMLFxyXG4gICAgICAgIGluY2x1ZGVFeGVjdXRpb25EYXRhOiB0cnVlLFxyXG4gICAgICB9KSxcclxuICAgIH0pO1xyXG4gIH1cclxufSJdfQ==