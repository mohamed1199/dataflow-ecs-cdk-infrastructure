#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataflowEcsFargateStack } from '../lib/dataflow-ecs-fargate-stack';


const app = new cdk.App();

new DataflowEcsFargateStack(app, 'DataflowEcsFargateStack', {
  env: {
    account: "847759515844",
    region: "us-east-1",
  },
});
