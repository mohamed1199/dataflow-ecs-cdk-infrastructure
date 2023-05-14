import * as cdk from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

// extend the props of the stack by adding the vpc type from the VpcStack
export interface KafkaClientStackProps extends cdk.StackProps {
    vpc: Vpc;
    cluster: Cluster;
    nlb: NetworkLoadBalancer;
    namespace: PrivateDnsNamespace;
    brokers: string;
    securityGroup: SecurityGroup;
}

export class KafkaClientStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: KafkaClientStackProps) {
        super(scope, id, props);
        const vpc = props.vpc;
        const cluster = props.cluster;
        const nlb = props.nlb;
        const namespace = props.namespace;
        const securityGroup = props.securityGroup;

        const taskDef = new FargateTaskDefinition(this, "kafkaClient-td", {
            cpu: 256,
            memoryLimitMiB: 512,
        });

        const ecrRepo = Repository.fromRepositoryName(this, "kafka", "kafka");

        const containerDef = taskDef.addContainer("kafkaClient-cd", {
            image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
            containerName: "kafkaClient-container",
            logging: new AwsLogDriver({
                streamPrefix: "kafkaClient-logs",
            }),
            portMappings: [
                {
                    containerPort: 8080,
                    protocol: Protocol.TCP,
                    name: "kafka-client-pm",
                    appProtocol: AppProtocol.http
                },
            ],
            environment: this.kafkaClientEnvs(props)
        });

        // create a fargate service
        const fargateService = new FargateService(this, "kafkaClient-fs", {
            cluster: cluster,
            taskDefinition: taskDef,
            desiredCount: 1,
            vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
            serviceName: "kafkaClient-service",
            assignPublicIp: false,
            securityGroups: [securityGroup],
            serviceConnectConfiguration: {
                namespace: namespace.namespaceName,
            },
        });

        const listener = nlb.addListener("kafkaClient-listener", {
            port: 8080,
        })

        fargateService.registerLoadBalancerTargets(
            {
                containerName: containerDef.containerName,
                newTargetGroupId: "kafkaClient-tg",
                listener: ListenerConfig.networkListener(listener, {
                    port: 8080,
                })
            }
        );
    }

    private kafkaClientEnvs(props: KafkaClientStackProps): { [key: string]: string } {
        const envs = {
            "KAFKA_BROKERS": props.brokers,
        }
        return envs;
    }

}