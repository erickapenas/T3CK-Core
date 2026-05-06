import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface BackupScheduleStackProps extends cdk.StackProps {
  clusterArn?: string;
  taskDefinitionArn?: string;
  backupImage: string;
  s3Bucket: string;
  schedule?: string; // cron expression
}

export class BackupScheduleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackupScheduleStackProps) {
    super(scope, id, props);

    const schedule = props.schedule ?? 'cron(0 3 ? * * *)';

    // Create IAM role for EventBridge to run tasks
    const eventRole = new iam.Role(this, 'EventBridgeInvokeEcsRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
    });

    // Allow running ECS tasks
    eventRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:RunTask', 'iam:PassRole'],
        resources: ['*'],
      })
    );

    // If the user provided cluster and task definitions, use them as targets
    if (props.clusterArn && props.taskDefinitionArn) {
      const rule = new events.Rule(this, 'BackupScheduleRule', {
        schedule: events.Schedule.expression(schedule),
      });

      const ecsTarget = new targets.EcsTask({
        cluster: ecs.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
          clusterArn: props.clusterArn,
          securityGroups: [] as any[],
          vpc: undefined as any,
        }),
        taskDefinition: ecs.TaskDefinition.fromTaskDefinitionArn(
          this,
          'ImportedTaskDef',
          props.taskDefinitionArn
        ),
        taskCount: 1,
        role: eventRole,
      });

      rule.addTarget(ecsTarget);
    }
  }
}
