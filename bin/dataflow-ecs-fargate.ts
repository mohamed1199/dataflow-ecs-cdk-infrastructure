#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SkipperStack } from '../lib/skipper_stack';
import { RdsStack } from '../lib/rds_stack';
import { NetworkStack } from '../lib/network_stack';
import { MskClusterStack } from '../lib/msk_cluster_stack';
import { DataflowStack } from '../lib/dataflow_stack';
import { KafkaClientStack } from '../lib/kafka_client';
import { AppStreamStack } from '../lib/app_stream_stack';


const app = new cdk.App();

const network = new NetworkStack(app, "NetworkStack", {

});

const rds = new RdsStack(app, "RdsStack", {
  vpc: network.vpc,
});

const msk = new MskClusterStack(app, "MskClusterStack", {
  vpc: network.vpc,
  securityGroup: network.mskSG
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
  brokers: msk.brokers,
  securityGroup: network.dataflowSG
});

const kafkaClient = new KafkaClientStack(app, "KafkaClientStack", {
  vpc: network.vpc,
  cluster: network.cluster,
  namespace: network.namespace,
  nlb: network.nlb,
  brokers: msk.brokers,
  securityGroup: network.kafkaClientSG
});

const appStream = new AppStreamStack(app, "AppStreamStack", {
  vpc: network.vpc,
  cluster: network.cluster,
  namespace: network.namespace
});

dataflow.addDependency(skipper);
dataflow.addDependency(rds);
dataflow.addDependency(msk);

skipper.addDependency(rds);
skipper.addDependency(msk);

kafkaClient.addDependency(rds);
kafkaClient.addDependency(msk);

appStream.addDependency(msk)
appStream.addDependency(dataflow)


