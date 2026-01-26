import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
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
export declare class ProvisioningStateMachine extends Construct {
    readonly stateMachine: stepfunctions.StateMachine;
    readonly dlqQueue: sqs.Queue;
    readonly successTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: ProvisioningStateMachineProps);
}
