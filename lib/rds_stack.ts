import * as cdk from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion, StorageType, SubnetGroup } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

export interface RdsStackProps extends cdk.StackProps {
    vpc: Vpc;
}

export class RdsStack extends cdk.Stack {

    public databaseCredentialsSecret: Secret;
    public rdsEndpoint: string;

    constructor(scope: Construct, id: string, props: RdsStackProps) {
        super(scope, id, props);

        const vpc = props.vpc;

        const rdsSg = new SecurityGroup(this, 'rds-sg', {
            vpc: vpc,
            allowAllOutbound: true
        });

        rdsSg.addIngressRule(Peer.anyIpv4(), Port.tcp(5432));

        const subnetGroup = new SubnetGroup(this, 'RDSSubnetGroup', {
            description: 'subnet group for rds',
            vpc: vpc,
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            },
        });

        this.databaseCredentialsSecret = new Secret(this, 'RdsCredentials', {
            secretName: 'RdsCredentials',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: 'root',
                }),
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password'
            }
        });
        const dbInstance = new DatabaseInstance(this, "PostgresInstance", {
            databaseName: 'dataflow',
            engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_14_6 }),
            subnetGroup: subnetGroup,
            instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
            vpc: vpc,
            backupRetention: cdk.Duration.days(0),
            storageType: StorageType.GP2,
            credentials: Credentials.fromSecret(this.databaseCredentialsSecret),
            allocatedStorage: 20,
            publiclyAccessible: false,
            securityGroups: [rdsSg]
        });

        this.rdsEndpoint = dbInstance.instanceEndpoint.hostname;
    }
}