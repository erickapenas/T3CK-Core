#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { T3CKStack } from '../lib/t3ck-stack';

const app = new cdk.App();

const getValue = (key: string, envKey?: string): string | undefined => {
  const envValue = process.env[envKey || key.toUpperCase()];
  const ctxValue = app.node.tryGetContext(key);
  const value = envValue ?? ctxValue;

  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).trim() || undefined;
};

const parseList = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v));
    }
  } catch {
    // fall through to comma split
  }

  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const vpcId = getValue('vpcId', 'VPC_ID');
const privateSubnetIds = parseList(getValue('privateSubnetIds', 'PRIVATE_SUBNET_IDS'));
const publicSubnetIds = parseList(getValue('publicSubnetIds', 'PUBLIC_SUBNET_IDS'));
const ecsSecurityGroupId = getValue('ecsSecurityGroupId', 'ECS_SECURITY_GROUP_ID');
const albSecurityGroupId = getValue('albSecurityGroupId', 'ALB_SECURITY_GROUP_ID');
const ecsTaskExecutionRoleArn = getValue('ecsTaskExecutionRoleArn', 'ECS_TASK_EXECUTION_ROLE_ARN');
const ecsTaskRoleArn = getValue('ecsTaskRoleArn', 'ECS_TASK_ROLE_ARN');
const lambdaRoleArn = getValue('lambdaRoleArn', 'LAMBDA_ROLE_ARN');

const redisHost = getValue('redisHost', 'REDIS_HOST');
const redisPort = getValue('redisPort', 'REDIS_PORT');
const dbHost = getValue('dbHost', 'DATABASE_HOST');
const dbPort = getValue('dbPort', 'DATABASE_PORT');
const dbName = getValue('dbName', 'DATABASE_NAME');
const dbUser = getValue('dbUser', 'DATABASE_USER');
const dbPassword = getValue('dbPassword', 'DATABASE_PASSWORD');
const dbSecretArn = getValue('dbSecretArn', 'DATABASE_SECRET_ARN');

new T3CKStack(app, 'T3CKStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'T3CK Platform Infrastructure',
  vpcId,
  privateSubnetIds,
  publicSubnetIds,
  ecsSecurityGroupId,
  albSecurityGroupId,
  ecsTaskExecutionRoleArn,
  ecsTaskRoleArn,
  lambdaRoleArn,
  redisHost,
  redisPort,
  dbHost,
  dbPort,
  dbName,
  dbUser,
  dbPassword,
  dbSecretArn,
});
