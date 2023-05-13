#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SkipperStack } from '../lib/skipper_stack';
import { RdsStack } from '../lib/rds_stack';
import { NetworkStack } from '../lib/network_stack';
import { MskClusterStack } from '../lib/msk_cluster_stack';
import { DataflowStack } from '../lib/dataflow_stack';
import { KafkaClientStack } from '../lib/kafka_client';


const app = new cdk.App();

const network = new NetworkStack(app, "NetworkStack", {

});

const rds = new RdsStack(app, "RdsStack", {
  vpc: network.vpc,
});

const msk = new MskClusterStack(app, "MskClusterStack", {
  vpc: network.vpc,
});

const skipper = new SkipperStack(app, "SkipperStack", {
  vpc: network.vpc,
  cluster: network.cluster,
  namespace: network.namespace,
  nlb: network.nlb,
  credentials: rds.databaseCredentialsSecret,
  rdsEndpoint: rds.rdsEndpoint,
});

const dataflow = new DataflowStack(app, "DataflowStack", {
  vpc: network.vpc,
  cluster: network.cluster,
  namespace: network.namespace,
  nlb: network.nlb,
  credentials: rds.databaseCredentialsSecret,
  rdsEndpoint: rds.rdsEndpoint,
  brokers: msk.brokers
});

const kafkaClient = new KafkaClientStack(app, "KafkaClientStack", {
  vpc: network.vpc,
  cluster: network.cluster,
  namespace: network.namespace,
  nlb: network.nlb,
  brokers: msk.brokers
});

dataflow.node.addDependency(skipper);
dataflow.node.addDependency(rds);
dataflow.node.addDependency(msk);

skipper.node.addDependency(rds);
skipper.node.addDependency(msk);

kafkaClient.node.addDependency(rds);
kafkaClient.node.addDependency(msk);




/* new DataflowEcsFargateStack(app, 'DataflowEcsFargateStack', {
  env: {
    account: "847759515844",
    region: "us-east-1",
  },
}); */

