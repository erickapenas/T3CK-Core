import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ObservabilityProps {
  alertEmail?: string;
  alertSlackWebhook?: string;
}

export class Observability extends Construct {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props?: ObservabilityProps) {
    super(scope, id);

    // SNS Topic para alertas
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 't3ck-alerts',
      displayName: 'T3CK Platform Alerts',
    });

    // Subscrições de email
    if (props?.alertEmail) {
      this.alertTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Subscrição Slack (se configurado)
    if (props?.alertSlackWebhook) {
      // Nota: Para Slack, você precisaria criar uma Lambda function
      // que converte SNS para Slack webhook
    }

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'T3CKDashboard', {
      dashboardName: 'T3CK-Platform',
    });

    // Métricas de uptime
    const uptimeMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HealthyHostCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Métricas de erros 5xx
    const error5xxMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Métricas de tempo de resposta
    const responseTimeMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Adicionar widgets ao dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Uptime',
        left: [uptimeMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: '5xx Errors',
        left: [error5xxMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Response Time',
        left: [responseTimeMetric],
        width: 12,
      })
    );

    // Alarmes
    const errorAlarm = new cloudwatch.Alarm(this, 'Error5xxAlarm', {
      metric: error5xxMetric,
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'API 5xx errors exceeded threshold',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const responseTimeAlarm = new cloudwatch.Alarm(this, 'ResponseTimeAlarm', {
      metric: responseTimeMetric,
      threshold: 2000, // 2 segundos
      evaluationPeriods: 2,
      alarmDescription: 'Response time exceeded threshold',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Adicionar ações aos alarmes
    errorAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.alertTopic)
    );
    responseTimeAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.alertTopic)
    );

    // Log Groups
    const authLogGroup = new logs.LogGroup(this, 'AuthLogGroup', {
      logGroupName: '/ecs/auth-service',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const webhookLogGroup = new logs.LogGroup(this, 'WebhookLogGroup', {
      logGroupName: '/ecs/webhook-service',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const tenantLogGroup = new logs.LogGroup(this, 'TenantLogGroup', {
      logGroupName: '/ecs/tenant-service',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
