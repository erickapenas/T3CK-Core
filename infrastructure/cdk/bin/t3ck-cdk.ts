#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { T3CKStack } from '../lib/t3ck-stack';

const app = new cdk.App();

new T3CKStack(app, 'T3CKStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'T3CK Platform Infrastructure',
});
