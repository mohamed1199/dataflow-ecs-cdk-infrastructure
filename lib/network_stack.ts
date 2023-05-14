import * as cdk from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {

    public readonly vpc: Vpc;
    public readonly cluster: Cluster;
    public readonly namespace: PrivateDnsNamespace;
    public readonly nlb: NetworkLoadBalancer;
    public readonly dataflowSG: SecurityGroup;
    public readonly kafkaClientSG: SecurityGroup;
    public readonly mskSG: SecurityGroup;


    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        this.vpc = new Vpc(this, 'DataFlow-VPC', {
            vpcName: "DataFlow-VPC",
            cidr: '11.0.0.0/16',
            maxAzs: 2,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'PublicSubnet',
                    subnetType: SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'PrivateSubnet',
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
            enableDnsHostnames: true,
            enableDnsSupport: true
        });

        // create an ECS cluster
        this.cluster = new Cluster(this, "ECSCluster", {
            clusterName: "ECSCluster",
            vpc: this.vpc,
        });

        this.namespace = new PrivateDnsNamespace(this, 'Namespace', {
            name: 'my_namespace',
            vpc: this.vpc,
        });

        //deploy a load balancer
        this.nlb = new NetworkLoadBalancer(this, "PublicNlb", {
            vpc: this.vpc,
            internetFacing: true,
            vpcSubnets: this.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC })
        });

        this.dataflowSG = new SecurityGroup(this, "dataflow-sg", {
            vpc: this.vpc,
            allowAllOutbound: true,
            securityGroupName: "dataflow-sg"
        });
        this.dataflowSG.addIngressRule(Peer.anyIpv4(), Port.tcp(9393));
        this.dataflowSG.addIngressRule(Peer.anyIpv4(), Port.tcp(9393 + 2));

        this.kafkaClientSG = new SecurityGroup(this, "kafkaClient-sg", {
            vpc: this.vpc,
            allowAllOutbound: true,
            securityGroupName: "kafkaClient-sg"
        });
        this.kafkaClientSG.addIngressRule(Peer.anyIpv4(), Port.tcp(8080));

        this.mskSG = new SecurityGroup(this, 'msk-sg', {
            securityGroupName: 'msk-sg',
            vpc: this.vpc,
            allowAllOutbound: true
        });

        this.mskSG.addIngressRule(Peer.securityGroupId(this.dataflowSG.securityGroupId), Port.tcp(9092));
        this.mskSG.addIngressRule(Peer.securityGroupId(this.kafkaClientSG.securityGroupId), Port.tcp(9092));
    }
}