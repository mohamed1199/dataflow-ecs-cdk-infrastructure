import * as cdk from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as msk from "@aws-cdk/aws-msk-alpha";

export interface MskClusterStackProps extends cdk.StackProps {
  vpc: Vpc;
  securityGroup: SecurityGroup;
}

export class MskClusterStack extends cdk.Stack {

  public readonly brokers: string;

  constructor(scope: Construct, id: string, props: MskClusterStackProps) {
    super(scope, id, props);

    const vpc = props.vpc;
    const securityGroup = props.securityGroup;

    const mskCluster = new msk.Cluster(this, 'MskCluster', {
      clusterName: 'MskCluster',
      kafkaVersion: msk.KafkaVersion.V2_8_0,
      numberOfBrokerNodes: 1,
      encryptionInTransit: {
        clientBroker: msk.ClientBrokerEncryption.PLAINTEXT,
      },
      vpc: vpc,
      ebsStorageInfo: {
        volumeSize: 5
      },
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      securityGroups: [securityGroup],
      vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
    });

    this.brokers = mskCluster.bootstrapBrokers;

  }
}