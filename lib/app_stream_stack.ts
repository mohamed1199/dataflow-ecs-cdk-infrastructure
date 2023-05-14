import * as cdk from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

export interface AppStreamStackProps extends cdk.StackProps {
    vpc: Vpc;
    cluster: Cluster;
    namespace: PrivateDnsNamespace;
}

export class AppStreamStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: AppStreamStackProps) {
        super(scope, id, props);
        const vpc = props.vpc;
        const cluster = props.cluster;
        const namespace = props.namespace;

        const taskDef = new FargateTaskDefinition(this, "appstream-td", {
            cpu: 512,
            memoryLimitMiB: 2048,
        });

        const ecrRepo = Repository.fromRepositoryName(this, "baseimage", "baseimage");

        const containerDef1 = taskDef.addContainer("import-stream-cd", {
            image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
            containerName: "import-stream",
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
                streamPrefix: "import-stream-logs",
            }),
        });

        const containerDef2 = taskDef.addContainer("import-task-cd", {
            image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
            containerName: "import-task",
            command: [
                "/bin/sh",
                "-c",
                "wget -qO- 'http://dataflow-service:9395/apps' --no-check-certificate --post-data='uri=https://dataflow.spring.io/task-maven-latest&force=true' ",
                "echo 'Maven Task apps imported' "
            ],
            logging: new AwsLogDriver({
                streamPrefix: "import-task-logs",
            }),
        });

        // create a fargate service
        const fargateService = new FargateService(this, "app-stream-fs", {
            cluster: cluster,
            taskDefinition: taskDef,
            desiredCount: 1,
            vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
            serviceName: "app-stream-service",
            assignPublicIp: false,
            serviceConnectConfiguration: {
                namespace: namespace.namespaceName,
            },
        });
    }
}