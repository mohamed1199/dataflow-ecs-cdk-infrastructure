import * as cdk from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Credentials } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { constants } from 'buffer';
import { Construct } from 'constructs';
import { Constants } from './constants';


export interface SkipperStackProps extends cdk.StackProps {
    vpc: Vpc;
    cluster: Cluster;
    nlb: NetworkLoadBalancer;
    namespace: PrivateDnsNamespace;
    credentials: Secret;
    rdsEndpoint: string;
}

export class SkipperStack extends cdk.Stack {
    public readonly securityGroup: SecurityGroup;

    constructor(scope: Construct, id: string, props: SkipperStackProps) {
        super(scope, id, props);
        const vpc = props.vpc;
        const cluster = props.cluster;
        const nlb = props.nlb;
        const namespace = props.namespace;

        this.securityGroup = new SecurityGroup(this, "skipper-sg", {
            vpc: vpc,
            allowAllOutbound: true,
            securityGroupName: "skipper-sg"
        });
        this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(7577));
        this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(7577 + 2));

        const taskDef = new FargateTaskDefinition(this, "skipper-td", {
            cpu: 256,
            memoryLimitMiB: 1024,
        });

        const ecrRepo = Repository.fromRepositoryName(this, "skipper", Constants.skipperEcrRepoName);

        const containerDef = taskDef.addContainer("skipper-cd", {
            image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
            containerName: "skipper-container",
            logging: new AwsLogDriver({
                streamPrefix: "skipper-logs",
            }),

            portMappings: [
                {
                    containerPort: 7577,
                    protocol: Protocol.TCP,
                    name: "skipper-pm",
                    appProtocol: AppProtocol.http
                },
            ],
            environment: this.skipperEnvs(props)
        });

        // create a fargate service
        const fargateService = new FargateService(this, "skipper-fs", {
            cluster: cluster,
            taskDefinition: taskDef,
            desiredCount: 1,
            vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
            serviceName: "skipper-service",
            assignPublicIp: false,
            securityGroups: [this.securityGroup],
            serviceConnectConfiguration: {
                namespace: namespace.namespaceName,
                services: [{
                    portMappingName: "skipper-pm",
                    dnsName: "skipper-service",
                    port: 7577 + 2, //service-connect service port
                }],
            },
        });

        const listener = nlb.addListener("skipper-listener", {
            port: 7577,
        })

        fargateService.registerLoadBalancerTargets(
            {
                containerName: containerDef.containerName,
                newTargetGroupId: "skipper-tg",
                listener: ListenerConfig.networkListener(listener, {
                    port: 7577,
                })
            }
        );
    }

    private skipperEnvs(props: SkipperStackProps): { [key: string]: string } {
        const envs = {
            "LANG": 'en_US.utf8',
            "LC_ALL": 'en_US.utf8',
            "JDK_JAVA_OPTIONS": '-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8',
            "SPRING_CLOUD_SKIPPER_SERVER_PLATFORM_LOCAL_ACCOUNTS_DEFAULT_PORTRANGE_LOW": '20000',
            "SPRING_CLOUD_SKIPPER_SERVER_PLATFORM_LOCAL_ACCOUNTS_DEFAULT_PORTRANGE_HIGH": '20190',
            "LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_CLOUD_SKIPPER_SERVER_DEPLOYER": 'ERROR',
            "SPRING_DATASOURCE_URL": `jdbc:postgresql://${props.rdsEndpoint}:5432/dataflow`,
            "SPRING_DATASOURCE_USERNAME": `${props.credentials.secretValueFromJson("username").unsafeUnwrap()}`,
            "SPRING_DATASOURCE_PASSWORD": `${props.credentials.secretValueFromJson("password").unsafeUnwrap()}`,
            "SPRING_DATASOURCE_DRIVER_CLASS_NAME": 'org.postgresql.Driver',
        }

        return envs;
    }
}