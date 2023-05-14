import * as cdk from 'aws-cdk-lib';
import { GatewayVpcEndpointAwsService, IVpc, InstanceClass, InstanceSize, InstanceType, InterfaceVpcEndpointAwsService, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import * as msk from "@aws-cdk/aws-msk-alpha";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion, StorageType, SubnetGroup } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

export class DataflowEcsFargateStack extends cdk.Stack {

  public databaseCredentialsSecret: Secret

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


  }

  private deployAppStream() {

    const taskDef = new FargateTaskDefinition(this, "app-stream-td", {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const ecrRepo = Repository.fromRepositoryName(this, "baseimage", "baseimage");

    const containerDef1 = taskDef.addContainer("app-stream-cd", {
      image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
      containerName: "dataflow-app-import-stream",
      command: [
        "/bin/sh",
        "-c",
        "wget -qO- 'http://dataflow-service:9395/apps' --no-check-certificate --post-data='uri=https://dataflow.spring.io/kafka-maven-latest&force=true'",
        "wget -qO- 'http://dataflow-service:9395/apps/sink/ver-log/3.0.1' --no-check-certificate --post-data='uri=maven://org.springframework.cloud.stream.app:log-sink-kafka:3.0.1'",
        "wget -qO- 'http://dataflow-service:9395/apps/sink/ver-log/2.1.5.RELEASE' --no-check-certificate --post-data='uri=maven://org.springframework.cloud.stream.app:log-sink-kafka:2.1.5.RELEASE'",
        "wget -qO- 'http://dataflow-service:9395/apps/sink/dataflow-tasklauncher/2.10.2-SNAPSHOT' --no-check-certificate --post-data='uri=maven://org.springframework.cloud:spring-cloud-dataflow-tasklauncher-sink-kafka:2.10.2-SNAPSHOT'",
        "echo 'Maven Stream apps imported' "
      ],
      logging: new AwsLogDriver({
        streamPrefix: "app-stream-logs",
      }),
    });

    const containerDef2 = taskDef.addContainer("app-task-cd", {
      image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
      containerName: "dataflow-app-import-task",
      command: [
        "/bin/sh",
        "-c",
        "wget -qO- 'http://dataflow-service:9395/apps' --no-check-certificate --post-data='uri=https://dataflow.spring.io/task-maven-latest&force=true' ",
        "echo 'Maven Task apps imported' "
      ],
      logging: new AwsLogDriver({
        streamPrefix: "app-task-logs",
      }),
    });
  }

}
