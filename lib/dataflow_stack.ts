import * as cdk from 'aws-cdk-lib';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { Constants } from './constants';

export interface DataflowStackProps extends cdk.StackProps {
    vpc: Vpc;
    cluster: Cluster;
    nlb: NetworkLoadBalancer;
    namespace: PrivateDnsNamespace;
    credentials: Secret;
    rdsEndpoint: string;
    brokers: string;
    securityGroup: SecurityGroup;
}

export class DataflowStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: DataflowStackProps) {
        super(scope, id, props);
        const vpc = props.vpc;
        const cluster = props.cluster;
        const nlb = props.nlb;
        const namespace = props.namespace;
        const securityGroup = props.securityGroup;

        const taskDef = new FargateTaskDefinition(this, "dataflow-td", {
            cpu: 512,
            memoryLimitMiB: 2048,
        });

        const ecrRepo = Repository.fromRepositoryName(this, "dataflow", Constants.dataflowEcrRepoName);

        const containerDef = taskDef.addContainer("dataflow-cd", {
            image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
            containerName: "dataflow-container",
            logging: new AwsLogDriver({
                streamPrefix: "dataflow-logs",
            }),

            portMappings: [
                {
                    containerPort: 9393,
                    protocol: Protocol.TCP,
                    name: "dataflow-pm",
                    appProtocol: AppProtocol.http
                },
            ],
            environment: this.dataflowEnvs(props)
        });

        // create a fargate service
        const fargateService = new FargateService(this, "dataflow-fs", {
            cluster: cluster,
            taskDefinition: taskDef,
            desiredCount: 1,
            vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
            serviceName: "dataflow-service",
            assignPublicIp: false,
            securityGroups: [securityGroup],
            serviceConnectConfiguration: {
                namespace: namespace.namespaceName,
                services: [{
                    portMappingName: "dataflow-pm",
                    dnsName: "dataflow-service",
                    port: 9393 + 2, //service-connect service port
                }],
            },
        });

        const listener = nlb.addListener("dataflow-listener", {
            port: 9393,
        })

        fargateService.registerLoadBalancerTargets(
            {
                containerName: containerDef.containerName,
                newTargetGroupId: "dataflow-tg",
                listener: ListenerConfig.networkListener(listener, {
                    port: 9393,
                })
            }
        );
    }

    private dataflowEnvs(props: DataflowStackProps): { [key: string]: string } {
        const envs = {
            "LANG": 'en_US.utf8',
            "LC_ALL": 'en_US.utf8',
            "JDK_JAVA_OPTIONS": '-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8',
            "SPRINGDOC_APIDOCS_ENABLED": 'true',
            "SPRINGDOC_SWAGGERUI_ENABLED": 'true',
            "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_CLOUD_STREAM_KAFKA_BINDER_BROKERS": `PLAINTEXT://${props.brokers}`,
            "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_CLOUD_STREAM_KAFKA_STREAMS_BINDER_BROKERS": `PLAINTEXT://${props.brokers}`,
            "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_KAFKA_STREAMS_PROPERTIES_METRICS_RECORDING_LEVEL": 'DEBUG',
            "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_TASK_SPRING_CLOUD_TASK_CLOSECONTEXTENABLED": 'true',
            "SPRING_CLOUD_SKIPPER_CLIENT_SERVER_URI": 'http://skipper-service:7579/api',
            "SPRING_DATASOURCE_URL": `jdbc:postgresql://${props.rdsEndpoint}:5432/dataflow`,
            "SPRING_DATASOURCE_USERNAME": `${props.credentials.secretValueFromJson("username").unsafeUnwrap()}`,
            "SPRING_DATASOURCE_PASSWORD": `${props.credentials.secretValueFromJson("password").unsafeUnwrap()}`,
            "SPRING_DATASOURCE_DRIVER_CLASS_NAME": 'org.postgresql.Driver',
        }
        return envs;
    }
}