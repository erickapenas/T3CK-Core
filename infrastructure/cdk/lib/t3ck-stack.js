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
exports.T3CKStack = void 0;
const provisioning_state_machine_1 = require("./provisioning-state-machine");
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatch_actions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const observability_1 = require("./observability");
class T3CKStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // VPC (importar do Terraform ou criar novo)
        const vpc = props?.vpcId
            ? ec2.Vpc.fromLookup(this, 'VPC', { vpcId: props.vpcId })
            : new ec2.Vpc(this, 'VPC', {
                maxAzs: 2,
                natGateways: 2,
            });
        const subnets = props?.privateSubnetIds
            ? props.privateSubnetIds.map((id) => ec2.Subnet.fromSubnetId(this, `Subnet${id}`, id))
            : vpc.privateSubnets;
        // ECS Cluster
        const cluster = new ecs.Cluster(this, 'T3CKCluster', {
            vpc,
            clusterName: 't3ck-cluster',
            containerInsights: true,
        });
        // Application Load Balancer
        const alb = new elbv2.ApplicationLoadBalancer(this, 'T3CKALB', {
            vpc,
            internetFacing: true,
            vpcSubnets: {
                subnets: props?.publicSubnetIds
                    ? props.publicSubnetIds.map((id) => ec2.Subnet.fromSubnetId(this, `PublicSubnet${id}`, id))
                    : vpc.publicSubnets,
            },
            securityGroup: props?.albSecurityGroupId
                ? ec2.SecurityGroup.fromSecurityGroupId(this, 'ALBSG', props.albSecurityGroupId)
                : undefined,
        });
        // Target Group para Auth Service
        const authTargetGroup = new elbv2.ApplicationTargetGroup(this, 'AuthTargetGroup', {
            vpc,
            port: 3001,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
        });
        // Target Group para Webhook Service
        const webhookTargetGroup = new elbv2.ApplicationTargetGroup(this, 'WebhookTargetGroup', {
            vpc,
            port: 3002,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
        });
        // Target Group para Tenant Service
        const tenantTargetGroup = new elbv2.ApplicationTargetGroup(this, 'TenantTargetGroup', {
            vpc,
            port: 3003,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
        });
        // Listener ALB
        const listener = alb.addListener('Listener', {
            port: 80,
            defaultTargetGroups: [authTargetGroup],
        });
        listener.addTargetGroups('WebhookTarget', {
            targetGroups: [webhookTargetGroup],
            conditions: [elbv2.ListenerCondition.pathPatterns(['/api/webhooks/*'])],
        });
        listener.addTargetGroups('TenantTarget', {
            targetGroups: [tenantTargetGroup],
            conditions: [elbv2.ListenerCondition.pathPatterns(['/provisioning/*'])],
        });
        // Task Definition - Auth Service
        const authTaskDefinition = new ecs.FargateTaskDefinition(this, 'AuthTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
            executionRole: props?.ecsTaskExecutionRoleArn
                ? ecs.Role.fromRoleArn(this, 'AuthExecRole', props.ecsTaskExecutionRoleArn)
                : undefined,
            taskRole: props?.ecsTaskRoleArn
                ? ecs.Role.fromRoleArn(this, 'AuthTaskRole', props.ecsTaskRoleArn)
                : undefined,
        });
        authTaskDefinition.addContainer('AuthContainer', {
            image: ecs.ContainerImage.fromRegistry('t3ck/auth-service:latest'),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'auth-service',
                logRetention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                PORT: '3001',
                NODE_ENV: 'production',
            },
        });
        // Task Definition - Webhook Service
        const webhookTaskDefinition = new ecs.FargateTaskDefinition(this, 'WebhookTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
            executionRole: props?.ecsTaskExecutionRoleArn
                ? ecs.Role.fromRoleArn(this, 'WebhookExecRole', props.ecsTaskExecutionRoleArn)
                : undefined,
            taskRole: props?.ecsTaskRoleArn
                ? ecs.Role.fromRoleArn(this, 'WebhookTaskRole', props.ecsTaskRoleArn)
                : undefined,
        });
        webhookTaskDefinition.addContainer('WebhookContainer', {
            image: ecs.ContainerImage.fromRegistry('t3ck/webhook-service:latest'),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'webhook-service',
                logRetention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                PORT: '3002',
                NODE_ENV: 'production',
            },
        });
        // Task Definition - Tenant Service
        const tenantTaskDefinition = new ecs.FargateTaskDefinition(this, 'TenantTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
            executionRole: props?.ecsTaskExecutionRoleArn
                ? ecs.Role.fromRoleArn(this, 'TenantExecRole', props.ecsTaskExecutionRoleArn)
                : undefined,
            taskRole: props?.ecsTaskRoleArn
                ? ecs.Role.fromRoleArn(this, 'TenantTaskRole', props.ecsTaskRoleArn)
                : undefined,
        });
        tenantTaskDefinition.addContainer('TenantContainer', {
            image: ecs.ContainerImage.fromRegistry('t3ck/tenant-service:latest'),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'tenant-service',
                logRetention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                PORT: '3003',
                NODE_ENV: 'production',
            },
        });
        // ECS Services
        const authService = new ecs.FargateService(this, 'AuthService', {
            cluster,
            taskDefinition: authTaskDefinition,
            desiredCount: 2,
            securityGroups: props?.ecsSecurityGroupId
                ? [
                    ec2.SecurityGroup.fromSecurityGroupId(this, 'ECSSG', props.ecsSecurityGroupId),
                ]
                : undefined,
            vpcSubnets: {
                subnets,
            },
        });
        const webhookService = new ecs.FargateService(this, 'WebhookService', {
            cluster,
            taskDefinition: webhookTaskDefinition,
            desiredCount: 2,
            securityGroups: props?.ecsSecurityGroupId
                ? [
                    ec2.SecurityGroup.fromSecurityGroupId(this, 'WebhookECSSG', props.ecsSecurityGroupId),
                ]
                : undefined,
            vpcSubnets: {
                subnets,
            },
        });
        const tenantService = new ecs.FargateService(this, 'TenantService', {
            cluster,
            taskDefinition: tenantTaskDefinition,
            desiredCount: 1,
            securityGroups: props?.ecsSecurityGroupId
                ? [
                    ec2.SecurityGroup.fromSecurityGroupId(this, 'TenantECSSG', props.ecsSecurityGroupId),
                ]
                : undefined,
            vpcSubnets: {
                subnets,
            },
        });
        // Registrar serviços no ALB
        authService.attachToApplicationTargetGroup(authTargetGroup);
        webhookService.attachToApplicationTargetGroup(webhookTargetGroup);
        tenantService.attachToApplicationTargetGroup(tenantTargetGroup);
        // EventBridge - Event Bus
        const eventBus = new events.EventBus(this, 'T3CKEventBus', {
            eventBusName: 't3ck-events',
        });
        // Lambda - Event Handler
        const eventHandlerLambda = new lambda.Function(this, 'EventHandlerLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/event-handler'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'EventHandlerRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            environment: {
                EVENT_BUS_NAME: eventBus.eventBusName,
            },
        });
        // Lambda - Provisioning
        const provisioningLambda = new lambda.Function(this, 'ProvisioningLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'ProvisioningRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
        });
        // EventBridge Rule - Webhook Events
        const webhookRule = new events.Rule(this, 'WebhookRule', {
            eventBus,
            eventPattern: {
                source: ['t3ck.orders', 't3ck.payments', 't3ck.shipments'],
            },
        });
        webhookRule.addTarget(new targets.LambdaFunction(eventHandlerLambda));
        // API Gateway
        const api = new apigateway.RestApi(this, 'T3CKApi', {
            restApiName: 'T3CK API',
            description: 'T3CK Platform API Gateway',
            deployOptions: {
                stageName: 'prod',
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
                metricsEnabled: true,
            },
        });
        // CloudWatch Alarms
        const errorAlarm = new cloudwatch.Alarm(this, 'API5xxAlarm', {
            metric: api.metricServerError({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 10,
            evaluationPeriods: 1,
            alarmDescription: 'API 5xx errors exceeded threshold',
        });
        // Observability
        const observability = new observability_1.Observability(this, 'Observability', {
            alertEmail: process.env.ALERT_EMAIL,
            alertSlackWebhook: process.env.ALERT_SLACK_WEBHOOK,
        });
        errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(observability.alertTopic));
        // Outputs
        new cdk.CfnOutput(this, 'ALBDNS', {
            value: alb.loadBalancerDnsName,
            description: 'Application Load Balancer DNS',
        });
        new cdk.CfnOutput(this, 'APIGatewayURL', {
            value: api.url,
            description: 'API Gateway URL',
        });
        new cdk.CfnOutput(this, 'EventBusName', {
            value: eventBus.eventBusName,
            description: 'EventBridge Event Bus Name',
        });
        // =========================================================================
        // PROVISIONING STATE MACHINE INTEGRATION
        // =========================================================================
        // Create Lambda functions for state machine tasks
        const terraformLambda = new lambda.Function(this, 'TerraformLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'TerraformLambdaRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(10),
            memorySize: 512,
            environment: {
                PROVISIONING_TYPE: 'terraform',
            },
        });
        const cdkLambda = new lambda.Function(this, 'CDKLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'CDKLambdaRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            environment: {
                PROVISIONING_TYPE: 'cdk',
            },
        });
        const firebaseConfigLambda = new lambda.Function(this, 'FirebaseConfigLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'FirebaseConfigLambdaRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
            environment: {
                PROVISIONING_TYPE: 'firebase',
            },
        });
        const route53ConfigLambda = new lambda.Function(this, 'Route53ConfigLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'Route53ConfigLambdaRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(3),
            memorySize: 256,
            environment: {
                PROVISIONING_TYPE: 'route53',
            },
        });
        const healthCheckLambda = new lambda.Function(this, 'HealthCheckLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/provisioning'),
            role: props?.lambdaRoleArn
                ? lambda.Role.fromRoleArn(this, 'HealthCheckLambdaRole', props.lambdaRoleArn)
                : undefined,
            timeout: cdk.Duration.minutes(10),
            memorySize: 256,
            environment: {
                PROVISIONING_TYPE: 'healthcheck',
            },
        });
        // Create the provisioning state machine
        const provisioningStateMachine = new provisioning_state_machine_1.ProvisioningStateMachine(this, 'ProvisioningStateMachine', {
            terraformLambda,
            cdkLambda,
            firebaseConfigLambda,
            route53ConfigLambda,
            healthCheckLambda,
        });
        // Export state machine and DLQ information
        new cdk.CfnOutput(this, 'ProvisioningStateMachineArn', {
            value: provisioningStateMachine.stateMachine.stateMachineArn,
            description: 'Provisioning State Machine ARN',
            exportName: 't3ck-provisioning-state-machine-arn',
        });
        new cdk.CfnOutput(this, 'ProvisioningDLQUrl', {
            value: provisioningStateMachine.dlqQueue.queueUrl,
            description: 'Provisioning DLQ URL',
            exportName: 't3ck-provisioning-dlq-url',
        });
        new cdk.CfnOutput(this, 'ProvisioningSuccessTopicArn', {
            value: provisioningStateMachine.successTopic.topicArn,
            description: 'Provisioning Success Notification Topic ARN',
            exportName: 't3ck-provisioning-success-topic-arn',
        });
    }
}
exports.T3CKStack = T3CKStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidDNjay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInQzY2stc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsNkVBQXdFO0FBQ3hFLGlEQUFtQztBQUNuQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDhFQUFnRTtBQUNoRSwrREFBaUQ7QUFDakQsK0RBQWlEO0FBQ2pELHdFQUEwRDtBQUMxRCx1RUFBeUQ7QUFDekQsMkRBQTZDO0FBRTdDLHVFQUF5RDtBQUN6RCx1RkFBeUU7QUFDekUsbURBQWdEO0FBY2hELE1BQWEsU0FBVSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3RDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsNENBQTRDO1FBQzVDLE1BQU0sR0FBRyxHQUFHLEtBQUssRUFBRSxLQUFLO1lBQ3RCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6RCxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7Z0JBQ3ZCLE1BQU0sRUFBRSxDQUFDO2dCQUNULFdBQVcsRUFBRSxDQUFDO2FBQ2YsQ0FBQyxDQUFDO1FBRVAsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLGdCQUFnQjtZQUNyQyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDdEYsQ0FB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QyxVQUFVLEVBQUUscUNBQXFDO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxRQUFRO1lBQ2pELFdBQVcsRUFBRSxzQkFBc0I7WUFDbkMsVUFBVSxFQUFFLDJCQUEyQjtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQ3JELEtBQUssRUFBRSx3QkFBd0IsQ0FBQyxZQUFZLENBQUMsUUFBUTtZQUNyRCxXQUFXLEVBQUUsNkNBQTZDO1lBQzFELFVBQVUsRUFBRSxxQ0FBcUM7U0FDbEQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUFDO0FBL1pKLDhCQStaSSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFByb3Zpc2lvbmluZ1N0YXRlTWFjaGluZSB9IGZyb20gJy4vcHJvdmlzaW9uaW5nLXN0YXRlLW1hY2hpbmUnO1xyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcclxuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcclxuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcclxuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XHJcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hfYWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcclxuaW1wb3J0IHsgT2JzZXJ2YWJpbGl0eSB9IGZyb20gJy4vb2JzZXJ2YWJpbGl0eSc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUM0NLU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICB2cGNJZD86IHN0cmluZztcclxuICBwcml2YXRlU3VibmV0SWRzPzogc3RyaW5nW107XHJcbiAgcHVibGljU3VibmV0SWRzPzogc3RyaW5nW107XHJcbiAgZWNzU2VjdXJpdHlHcm91cElkPzogc3RyaW5nO1xyXG4gIGFsYlNlY3VyaXR5R3JvdXBJZD86IHN0cmluZztcclxuICBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybj86IHN0cmluZztcclxuICBlY3NUYXNrUm9sZUFybj86IHN0cmluZztcclxuICBsYW1iZGFSb2xlQXJuPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVDNDS1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFQzQ0tTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICAvLyBWUEMgKGltcG9ydGFyIGRvIFRlcnJhZm9ybSBvdSBjcmlhciBub3ZvKVxyXG4gICAgY29uc3QgdnBjID0gcHJvcHM/LnZwY0lkXHJcbiAgICAgID8gZWMyLlZwYy5mcm9tTG9va3VwKHRoaXMsICdWUEMnLCB7IHZwY0lkOiBwcm9wcy52cGNJZCB9KVxyXG4gICAgICA6IG5ldyBlYzIuVnBjKHRoaXMsICdWUEMnLCB7XHJcbiAgICAgICAgICBtYXhBenM6IDIsXHJcbiAgICAgICAgICBuYXRHYXRld2F5czogMixcclxuICAgICAgICB9KTtcclxuXHJcbiAgICBjb25zdCBzdWJuZXRzID0gcHJvcHM/LnByaXZhdGVTdWJuZXRJZHNcclxuICAgICAgPyBwcm9wcy5wcml2YXRlU3VibmV0SWRzLm1hcCgoaWQpID0+IGVjMi5TdWJuZXQuZnJvbVN1Ym5ldElkKHRoaXMsIGBTdWJuZXQke2lkfWAsIGlkKSlcclxuICAgICAgOiB2cGMucHJpdmF0ZVN1Ym5ldHM7XHJcblxyXG4gICAgLy8gRUNTIENsdXN0ZXJcclxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcywgJ1QzQ0tDbHVzdGVyJywge1xyXG4gICAgICB2cGMsXHJcbiAgICAgIGNsdXN0ZXJOYW1lOiAndDNjay1jbHVzdGVyJyxcclxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyXHJcbiAgICBjb25zdCBhbGIgPSBuZXcgZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIodGhpcywgJ1QzQ0tBTEInLCB7XHJcbiAgICAgIHZwYyxcclxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXHJcbiAgICAgIHZwY1N1Ym5ldHM6IHtcclxuICAgICAgICBzdWJuZXRzOiBwcm9wcz8ucHVibGljU3VibmV0SWRzXHJcbiAgICAgICAgICA/IHByb3BzLnB1YmxpY1N1Ym5ldElkcy5tYXAoKGlkKSA9PlxyXG4gICAgICAgICAgICAgIGVjMi5TdWJuZXQuZnJvbVN1Ym5ldElkKHRoaXMsIGBQdWJsaWNTdWJuZXQke2lkfWAsIGlkKVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICA6IHZwYy5wdWJsaWNTdWJuZXRzLFxyXG4gICAgICB9LFxyXG4gICAgICBzZWN1cml0eUdyb3VwOiBwcm9wcz8uYWxiU2VjdXJpdHlHcm91cElkXHJcbiAgICAgICAgPyBlYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdBTEJTRycsIHByb3BzLmFsYlNlY3VyaXR5R3JvdXBJZClcclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhcmdldCBHcm91cCBwYXJhIEF1dGggU2VydmljZVxyXG4gICAgY29uc3QgYXV0aFRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ0F1dGhUYXJnZXRHcm91cCcsIHtcclxuICAgICAgdnBjLFxyXG4gICAgICBwb3J0OiAzMDAxLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxyXG4gICAgICBoZWFsdGhDaGVjazoge1xyXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcclxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcclxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhcmdldCBHcm91cCBwYXJhIFdlYmhvb2sgU2VydmljZVxyXG4gICAgY29uc3Qgd2ViaG9va1RhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1dlYmhvb2tUYXJnZXRHcm91cCcsIHtcclxuICAgICAgdnBjLFxyXG4gICAgICBwb3J0OiAzMDAyLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxyXG4gICAgICBoZWFsdGhDaGVjazoge1xyXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcclxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcclxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhcmdldCBHcm91cCBwYXJhIFRlbmFudCBTZXJ2aWNlXHJcbiAgICBjb25zdCB0ZW5hbnRUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdUZW5hbnRUYXJnZXRHcm91cCcsIHtcclxuICAgICAgdnBjLFxyXG4gICAgICBwb3J0OiAzMDAzLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxyXG4gICAgICBoZWFsdGhDaGVjazoge1xyXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcclxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcclxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExpc3RlbmVyIEFMQlxyXG4gICAgY29uc3QgbGlzdGVuZXIgPSBhbGIuYWRkTGlzdGVuZXIoJ0xpc3RlbmVyJywge1xyXG4gICAgICBwb3J0OiA4MCxcclxuICAgICAgZGVmYXVsdFRhcmdldEdyb3VwczogW2F1dGhUYXJnZXRHcm91cF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBsaXN0ZW5lci5hZGRUYXJnZXRHcm91cHMoJ1dlYmhvb2tUYXJnZXQnLCB7XHJcbiAgICAgIHRhcmdldEdyb3VwczogW3dlYmhvb2tUYXJnZXRHcm91cF0sXHJcbiAgICAgIGNvbmRpdGlvbnM6IFtlbGJ2Mi5MaXN0ZW5lckNvbmRpdGlvbi5wYXRoUGF0dGVybnMoWycvYXBpL3dlYmhvb2tzLyonXSldLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbGlzdGVuZXIuYWRkVGFyZ2V0R3JvdXBzKCdUZW5hbnRUYXJnZXQnLCB7XHJcbiAgICAgIHRhcmdldEdyb3VwczogW3RlbmFudFRhcmdldEdyb3VwXSxcclxuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLnBhdGhQYXR0ZXJucyhbJy9wcm92aXNpb25pbmcvKiddKV0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYXNrIERlZmluaXRpb24gLSBBdXRoIFNlcnZpY2VcclxuICAgIGNvbnN0IGF1dGhUYXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdBdXRoVGFza0RlZicsIHtcclxuICAgICAgbWVtb3J5TGltaXRNaUI6IDUxMixcclxuICAgICAgY3B1OiAyNTYsXHJcbiAgICAgIGV4ZWN1dGlvblJvbGU6IHByb3BzPy5lY3NUYXNrRXhlY3V0aW9uUm9sZUFyblxyXG4gICAgICAgID8gZWNzLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0F1dGhFeGVjUm9sZScsIHByb3BzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB0YXNrUm9sZTogcHJvcHM/LmVjc1Rhc2tSb2xlQXJuXHJcbiAgICAgICAgPyBlY3MuUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnQXV0aFRhc2tSb2xlJywgcHJvcHMuZWNzVGFza1JvbGVBcm4pXHJcbiAgICAgICAgOiB1bmRlZmluZWQsXHJcbiAgICB9KTtcclxuXHJcbiAgICBhdXRoVGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoQ29udGFpbmVyJywge1xyXG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeSgndDNjay9hdXRoLXNlcnZpY2U6bGF0ZXN0JyksXHJcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xyXG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGgtc2VydmljZScsXHJcbiAgICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIH0pLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPUlQ6ICczMDAxJyxcclxuICAgICAgICBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVGFzayBEZWZpbml0aW9uIC0gV2ViaG9vayBTZXJ2aWNlXHJcbiAgICBjb25zdCB3ZWJob29rVGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnV2ViaG9va1Rhc2tEZWYnLCB7XHJcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiA1MTIsXHJcbiAgICAgIGNwdTogMjU2LFxyXG4gICAgICBleGVjdXRpb25Sb2xlOiBwcm9wcz8uZWNzVGFza0V4ZWN1dGlvblJvbGVBcm5cclxuICAgICAgICA/IGVjcy5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdXZWJob29rRXhlY1JvbGUnLCBwcm9wcy5lY3NUYXNrRXhlY3V0aW9uUm9sZUFybilcclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdGFza1JvbGU6IHByb3BzPy5lY3NUYXNrUm9sZUFyblxyXG4gICAgICAgID8gZWNzLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ1dlYmhvb2tUYXNrUm9sZScsIHByb3BzLmVjc1Rhc2tSb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgfSk7XHJcblxyXG4gICAgd2ViaG9va1Rhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignV2ViaG9va0NvbnRhaW5lcicsIHtcclxuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoJ3QzY2svd2ViaG9vay1zZXJ2aWNlOmxhdGVzdCcpLFxyXG4gICAgICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVycy5hd3NMb2dzKHtcclxuICAgICAgICBzdHJlYW1QcmVmaXg6ICd3ZWJob29rLXNlcnZpY2UnLFxyXG4gICAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICB9KSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1JUOiAnMzAwMicsXHJcbiAgICAgICAgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhc2sgRGVmaW5pdGlvbiAtIFRlbmFudCBTZXJ2aWNlXHJcbiAgICBjb25zdCB0ZW5hbnRUYXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUZW5hbnRUYXNrRGVmJywge1xyXG4gICAgICBtZW1vcnlMaW1pdE1pQjogNTEyLFxyXG4gICAgICBjcHU6IDI1NixcclxuICAgICAgZXhlY3V0aW9uUm9sZTogcHJvcHM/LmVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuXHJcbiAgICAgICAgPyBlY3MuUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnVGVuYW50RXhlY1JvbGUnLCBwcm9wcy5lY3NUYXNrRXhlY3V0aW9uUm9sZUFybilcclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdGFza1JvbGU6IHByb3BzPy5lY3NUYXNrUm9sZUFyblxyXG4gICAgICAgID8gZWNzLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ1RlbmFudFRhc2tSb2xlJywgcHJvcHMuZWNzVGFza1JvbGVBcm4pXHJcbiAgICAgICAgOiB1bmRlZmluZWQsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0ZW5hbnRUYXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ1RlbmFudENvbnRhaW5lcicsIHtcclxuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoJ3QzY2svdGVuYW50LXNlcnZpY2U6bGF0ZXN0JyksXHJcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xyXG4gICAgICAgIHN0cmVhbVByZWZpeDogJ3RlbmFudC1zZXJ2aWNlJyxcclxuICAgICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgfSksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9SVDogJzMwMDMnLFxyXG4gICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBFQ1MgU2VydmljZXNcclxuICAgIGNvbnN0IGF1dGhTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnQXV0aFNlcnZpY2UnLCB7XHJcbiAgICAgIGNsdXN0ZXIsXHJcbiAgICAgIHRhc2tEZWZpbml0aW9uOiBhdXRoVGFza0RlZmluaXRpb24sXHJcbiAgICAgIGRlc2lyZWRDb3VudDogMixcclxuICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzPy5lY3NTZWN1cml0eUdyb3VwSWRcclxuICAgICAgICA/IFtcclxuICAgICAgICAgICAgZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZCh0aGlzLCAnRUNTU0cnLCBwcm9wcy5lY3NTZWN1cml0eUdyb3VwSWQpLFxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB2cGNTdWJuZXRzOiB7XHJcbiAgICAgICAgc3VibmV0cyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHdlYmhvb2tTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnV2ViaG9va1NlcnZpY2UnLCB7XHJcbiAgICAgIGNsdXN0ZXIsXHJcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB3ZWJob29rVGFza0RlZmluaXRpb24sXHJcbiAgICAgIGRlc2lyZWRDb3VudDogMixcclxuICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzPy5lY3NTZWN1cml0eUdyb3VwSWRcclxuICAgICAgICA/IFtcclxuICAgICAgICAgICAgZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZCh0aGlzLCAnV2ViaG9va0VDU1NHJywgcHJvcHMuZWNzU2VjdXJpdHlHcm91cElkKSxcclxuICAgICAgICAgIF1cclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdnBjU3VibmV0czoge1xyXG4gICAgICAgIHN1Ym5ldHMsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB0ZW5hbnRTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnVGVuYW50U2VydmljZScsIHtcclxuICAgICAgY2x1c3RlcixcclxuICAgICAgdGFza0RlZmluaXRpb246IHRlbmFudFRhc2tEZWZpbml0aW9uLFxyXG4gICAgICBkZXNpcmVkQ291bnQ6IDEsXHJcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBwcm9wcz8uZWNzU2VjdXJpdHlHcm91cElkXHJcbiAgICAgICAgPyBbXHJcbiAgICAgICAgICAgIGVjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ1RlbmFudEVDU1NHJywgcHJvcHMuZWNzU2VjdXJpdHlHcm91cElkKSxcclxuICAgICAgICAgIF1cclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdnBjU3VibmV0czoge1xyXG4gICAgICAgIHN1Ym5ldHMsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZWdpc3RyYXIgc2VydmnDp29zIG5vIEFMQlxyXG4gICAgYXV0aFNlcnZpY2UuYXR0YWNoVG9BcHBsaWNhdGlvblRhcmdldEdyb3VwKGF1dGhUYXJnZXRHcm91cCk7XHJcbiAgICB3ZWJob29rU2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAod2ViaG9va1RhcmdldEdyb3VwKTtcclxuICAgIHRlbmFudFNlcnZpY2UuYXR0YWNoVG9BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRlbmFudFRhcmdldEdyb3VwKTtcclxuXHJcbiAgICAvLyBFdmVudEJyaWRnZSAtIEV2ZW50IEJ1c1xyXG4gICAgY29uc3QgZXZlbnRCdXMgPSBuZXcgZXZlbnRzLkV2ZW50QnVzKHRoaXMsICdUM0NLRXZlbnRCdXMnLCB7XHJcbiAgICAgIGV2ZW50QnVzTmFtZTogJ3QzY2stZXZlbnRzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExhbWJkYSAtIEV2ZW50IEhhbmRsZXJcclxuICAgIGNvbnN0IGV2ZW50SGFuZGxlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0V2ZW50SGFuZGxlckxhbWJkYScsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZXZlbnQtaGFuZGxlcicpLFxyXG4gICAgICByb2xlOiBwcm9wcz8ubGFtYmRhUm9sZUFyblxyXG4gICAgICAgID8gbGFtYmRhLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0V2ZW50SGFuZGxlclJvbGUnLCBwcm9wcy5sYW1iZGFSb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBFVkVOVF9CVVNfTkFNRTogZXZlbnRCdXMuZXZlbnRCdXNOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTGFtYmRhIC0gUHJvdmlzaW9uaW5nXHJcbiAgICBjb25zdCBwcm92aXNpb25pbmdMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcm92aXNpb25pbmdMYW1iZGEnLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3Byb3Zpc2lvbmluZycpLFxyXG4gICAgICByb2xlOiBwcm9wcz8ubGFtYmRhUm9sZUFyblxyXG4gICAgICAgID8gbGFtYmRhLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ1Byb3Zpc2lvbmluZ1JvbGUnLCBwcm9wcy5sYW1iZGFSb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRXZlbnRCcmlkZ2UgUnVsZSAtIFdlYmhvb2sgRXZlbnRzXHJcbiAgICBjb25zdCB3ZWJob29rUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnV2ViaG9va1J1bGUnLCB7XHJcbiAgICAgIGV2ZW50QnVzLFxyXG4gICAgICBldmVudFBhdHRlcm46IHtcclxuICAgICAgICBzb3VyY2U6IFsndDNjay5vcmRlcnMnLCAndDNjay5wYXltZW50cycsICd0M2NrLnNoaXBtZW50cyddLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgd2ViaG9va1J1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGV2ZW50SGFuZGxlckxhbWJkYSkpO1xyXG5cclxuICAgIC8vIEFQSSBHYXRld2F5XHJcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdUM0NLQXBpJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ1QzQ0sgQVBJJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdUM0NLIFBsYXRmb3JtIEFQSSBHYXRld2F5JyxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybXNcclxuICAgIGNvbnN0IGVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQVBJNXh4QWxhcm0nLCB7XHJcbiAgICAgIG1ldHJpYzogYXBpLm1ldHJpY1NlcnZlckVycm9yKHtcclxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXHJcbiAgICAgIH0pLFxyXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxyXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcclxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FQSSA1eHggZXJyb3JzIGV4Y2VlZGVkIHRocmVzaG9sZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPYnNlcnZhYmlsaXR5XHJcbiAgICBjb25zdCBvYnNlcnZhYmlsaXR5ID0gbmV3IE9ic2VydmFiaWxpdHkodGhpcywgJ09ic2VydmFiaWxpdHknLCB7XHJcbiAgICAgIGFsZXJ0RW1haWw6IHByb2Nlc3MuZW52LkFMRVJUX0VNQUlMLFxyXG4gICAgICBhbGVydFNsYWNrV2ViaG9vazogcHJvY2Vzcy5lbnYuQUxFUlRfU0xBQ0tfV0VCSE9PSyxcclxuICAgIH0pO1xyXG5cclxuICAgIGVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hfYWN0aW9ucy5TbnNBY3Rpb24ob2JzZXJ2YWJpbGl0eS5hbGVydFRvcGljKSk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FMQkROUycsIHtcclxuICAgICAgdmFsdWU6IGFsYi5sb2FkQmFsYW5jZXJEbnNOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIgRE5TJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBUElHYXRld2F5VVJMJywge1xyXG4gICAgICB2YWx1ZTogYXBpLnVybCxcclxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0V2ZW50QnVzTmFtZScsIHtcclxuICAgICAgdmFsdWU6IGV2ZW50QnVzLmV2ZW50QnVzTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdFdmVudEJyaWRnZSBFdmVudCBCdXMgTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBQUk9WSVNJT05JTkcgU1RBVEUgTUFDSElORSBJTlRFR1JBVElPTlxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgXHJcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9ucyBmb3Igc3RhdGUgbWFjaGluZSB0YXNrc1xyXG4gICAgY29uc3QgdGVycmFmb3JtTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVGVycmFmb3JtTGFtYmRhJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9wcm92aXNpb25pbmcnKSxcclxuICAgICAgcm9sZTogcHJvcHM/LmxhbWJkYVJvbGVBcm5cclxuICAgICAgICA/IGxhbWJkYS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdUZXJyYWZvcm1MYW1iZGFSb2xlJywgcHJvcHMubGFtYmRhUm9sZUFybilcclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUFJPVklTSU9OSU5HX1RZUEU6ICd0ZXJyYWZvcm0nLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY2RrTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ0RLTGFtYmRhJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9wcm92aXNpb25pbmcnKSxcclxuICAgICAgcm9sZTogcHJvcHM/LmxhbWJkYVJvbGVBcm5cclxuICAgICAgICA/IGxhbWJkYS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdDREtMYW1iZGFSb2xlJywgcHJvcHMubGFtYmRhUm9sZUFybilcclxuICAgICAgICA6IHVuZGVmaW5lZCxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxyXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBST1ZJU0lPTklOR19UWVBFOiAnY2RrJyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGZpcmViYXNlQ29uZmlnTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRmlyZWJhc2VDb25maWdMYW1iZGEnLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3Byb3Zpc2lvbmluZycpLFxyXG4gICAgICByb2xlOiBwcm9wcz8ubGFtYmRhUm9sZUFyblxyXG4gICAgICAgID8gbGFtYmRhLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0ZpcmViYXNlQ29uZmlnTGFtYmRhUm9sZScsIHByb3BzLmxhbWJkYVJvbGVBcm4pXHJcbiAgICAgICAgOiB1bmRlZmluZWQsXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUFJPVklTSU9OSU5HX1RZUEU6ICdmaXJlYmFzZScsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCByb3V0ZTUzQ29uZmlnTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUm91dGU1M0NvbmZpZ0xhbWJkYScsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvcHJvdmlzaW9uaW5nJyksXHJcbiAgICAgIHJvbGU6IHByb3BzPy5sYW1iZGFSb2xlQXJuXHJcbiAgICAgICAgPyBsYW1iZGEuUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnUm91dGU1M0NvbmZpZ0xhbWJkYVJvbGUnLCBwcm9wcy5sYW1iZGFSb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygzKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBST1ZJU0lPTklOR19UWVBFOiAncm91dGU1MycsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBoZWFsdGhDaGVja0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0hlYWx0aENoZWNrTGFtYmRhJywge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9wcm92aXNpb25pbmcnKSxcclxuICAgICAgcm9sZTogcHJvcHM/LmxhbWJkYVJvbGVBcm5cclxuICAgICAgICA/IGxhbWJkYS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdIZWFsdGhDaGVja0xhbWJkYVJvbGUnLCBwcm9wcy5sYW1iZGFSb2xlQXJuKVxyXG4gICAgICAgIDogdW5kZWZpbmVkLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQUk9WSVNJT05JTkdfVFlQRTogJ2hlYWx0aGNoZWNrJyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgcHJvdmlzaW9uaW5nIHN0YXRlIG1hY2hpbmVcclxuICAgIGNvbnN0IHByb3Zpc2lvbmluZ1N0YXRlTWFjaGluZSA9IG5ldyBQcm92aXNpb25pbmdTdGF0ZU1hY2hpbmUoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdQcm92aXNpb25pbmdTdGF0ZU1hY2hpbmUnLFxyXG4gICAgICB7XHJcbiAgICAgICAgdGVycmFmb3JtTGFtYmRhLFxyXG4gICAgICAgIGNka0xhbWJkYSxcclxuICAgICAgICBmaXJlYmFzZUNvbmZpZ0xhbWJkYSxcclxuICAgICAgICByb3V0ZTUzQ29uZmlnTGFtYmRhLFxyXG4gICAgICAgIGhlYWx0aENoZWNrTGFtYmRhLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIEV4cG9ydCBzdGF0ZSBtYWNoaW5lIGFuZCBETFEgaW5mb3JtYXRpb25cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm92aXNpb25pbmdTdGF0ZU1hY2hpbmVBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiBwcm92aXNpb25pbmdTdGF0ZU1hY2hpbmUuc3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdQcm92aXNpb25pbmcgU3RhdGUgTWFjaGluZSBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAndDNjay1wcm92aXNpb25pbmctc3RhdGUtbWFjaGluZS1hcm4nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb3Zpc2lvbmluZ0RMUVVybCcsIHtcclxuICAgICAgdmFsdWU6IHByb3Zpc2lvbmluZ1N0YXRlTWFjaGluZS5kbHFRdWV1ZS5xdWV1ZVVybCxcclxuICAgICAgZGVzY3JpcHRpb246ICdQcm92aXNpb25pbmcgRExRIFVSTCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICd0M2NrLXByb3Zpc2lvbmluZy1kbHEtdXJsJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm92aXNpb25pbmdTdWNjZXNzVG9waWNBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiBwcm92aXNpb25pbmdTdGF0ZU1hY2hpbmUuc3VjY2Vzc1RvcGljLnRvcGljQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb3Zpc2lvbmluZyBTdWNjZXNzIE5vdGlmaWNhdGlvbiBUb3BpYyBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiAndDNjay1wcm92aXNpb25pbmctc3VjY2Vzcy10b3BpYy1hcm4nLFxyXG4gICAgfSk7XHJcbiAgfX0iXX0=