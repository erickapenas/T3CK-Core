import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
export interface ObservabilityProps {
    alertEmail?: string;
    alertSlackWebhook?: string;
}
export declare class Observability extends Construct {
    readonly alertTopic: sns.Topic;
    readonly dashboard: cloudwatch.Dashboard;
    constructor(scope: Construct, id: string, props?: ObservabilityProps);
}
