import { ProvisioningStateMachine } from './provisioning-state-machine';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Observability } from './observability';
import { Construct } from 'constructs';

export interface T3CKStackProps extends cdk.StackProps {
  vpcId?: string;
  privateSubnetIds?: string[];
  publicSubnetIds?: string[];
  ecsSecurityGroupId?: string;
  albSecurityGroupId?: string;
  ecsTaskExecutionRoleArn?: string;
  ecsTaskRoleArn?: string;
  lambdaRoleArn?: string;
}

export class T3CKStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: T3CKStackProps) {
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
          ? props.publicSubnetIds.map((id) =>
              ec2.Subnet.fromSubnetId(this, `PublicSubnet${id}`, id)
            )
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
    const observability = new Observability(this, 'Observability', {
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
    const provisioningStateMachine = new ProvisioningStateMachine(
      this,
      'ProvisioningStateMachine',
      {
        terraformLambda,
        cdkLambda,
        firebaseConfigLambda,
        route53ConfigLambda,
        healthCheckLambda,
      }
    );

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
  }}