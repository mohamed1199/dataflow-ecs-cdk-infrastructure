import * as cdk from 'aws-cdk-lib';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {

    public readonly vpc: Vpc;
    public readonly cluster: Cluster;
    public readonly namespace: PrivateDnsNamespace;
    public readonly nlb: NetworkLoadBalancer;

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
    }
}