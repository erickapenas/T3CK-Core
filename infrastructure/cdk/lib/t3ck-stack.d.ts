import * as cdk from 'aws-cdk-lib';
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
export declare class T3CKStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: T3CKStackProps);
}
