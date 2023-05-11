import * as cdk from 'aws-cdk-lib';
import { GatewayVpcEndpointAwsService, IVpc, InstanceClass, InstanceSize, InstanceType, InterfaceVpcEndpointAwsService, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition, ListenerConfig, Protocol } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct, Dependable } from 'constructs';
import * as msk from "@aws-cdk/aws-msk-alpha";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion, StorageType, SubnetGroup } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

export class DataflowEcsFargateStack extends cdk.Stack {

  public databaseCredentialsSecret: Secret

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create the VPC with subnets
    const myvpc = this.deployVPC();

    // deploy the msk (kafka) cluster  
    const mskCluster = this.deployMSK(myvpc);

    // deploy the RDS Postgres database  
    const rdsDB = this.deployRDS(myvpc);

    // create an ECS cluster
    const myCluster = new Cluster(this, "TestCluster", {
      clusterName: "TestCluster",
      vpc: myvpc,
    });

    const cloudMapNamespace = new PrivateDnsNamespace(this, 'Namespace', {
      name: 'my_namespace',
      vpc: myvpc,
    });

    //deploy a load balancer
    const nlb = new NetworkLoadBalancer(this, "PublicNlb", {
      vpc: myvpc,
      internetFacing: true,
      vpcSubnets: myvpc.selectSubnets({ subnetType: SubnetType.PUBLIC })
    });

    // deploy skipper service
    const skipperService = this.deployTask(
      "skipper-service", myvpc, myCluster, 7577, this.skipperEnvs(rdsDB.instanceEndpoint.hostname, this.databaseCredentialsSecret.secretValueFromJson("password").unsafeUnwrap(),
        this.databaseCredentialsSecret.secretValueFromJson("username").unsafeUnwrap(),), cloudMapNamespace, "skipper", nlb,
    );

    // deploy dataflow service
    const dataflow = this.deployTask("dataflow-service", myvpc, myCluster, 9393,
      this.dataflowEnvs(rdsDB.instanceEndpoint.hostname, this.databaseCredentialsSecret.secretValueFromJson("password").unsafeUnwrap(),
        this.databaseCredentialsSecret.secretValueFromJson("username").unsafeUnwrap(), mskCluster.bootstrapBrokers),
      cloudMapNamespace, "dataflow", nlb);

    // deploy kafka client service
    const kafkaConsole = this.deployTask("kafka-service", myvpc, myCluster, 8080,
      this.kafkaClientEnvs(mskCluster.bootstrapBrokers),
      cloudMapNamespace, "kafka", nlb);

    //deploy App stream containers
    this.deployAppStream();

    skipperService.node.addDependency(mskCluster);
    skipperService.node.addDependency(rdsDB);

    dataflow.node.addDependency(mskCluster);
    dataflow.node.addDependency(rdsDB);
    dataflow.node.addDependency(skipperService);

    kafkaConsole.node.addDependency(mskCluster);
    kafkaConsole.node.addDependency(rdsDB);
  }

  private deployTask(serviceName: String, myvpc: IVpc, myCluster: Cluster, taskPort: number, envs: { [key: string]: string }, namespace: PrivateDnsNamespace, ecrRepoName: string, nlb: NetworkLoadBalancer): FargateService {

    const serviceSG = new SecurityGroup(this, `${serviceName}-sg`, {
      vpc: myvpc,
      allowAllOutbound: true,
      securityGroupName: `${serviceName}-sg`
    });
    serviceSG.addIngressRule(Peer.anyIpv4(), Port.tcp(taskPort));
    serviceSG.addIngressRule(Peer.anyIpv4(), Port.tcp(taskPort + 2));

    const taskDef = new FargateTaskDefinition(this, `${serviceName}-td`, {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    const ecrRepo = Repository.fromRepositoryName(this, `${serviceName}`, ecrRepoName);

    const containerDef = taskDef.addContainer(`${serviceName}-cd`, {
      image: ContainerImage.fromEcrRepository(ecrRepo, "latest"),
      containerName: `${serviceName}-container`,
      logging: new AwsLogDriver({
        streamPrefix: `${serviceName}-logs`,
      }),
      portMappings: [
        {
          containerPort: taskPort,
          protocol: Protocol.TCP,
          name: `${serviceName}-pm`,
          appProtocol: AppProtocol.http
        },
      ],
      environment: envs
    });

    // create a fargate service
    const fargateService = new FargateService(this, `${serviceName}-fs`, {
      cluster: myCluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      vpcSubnets: myvpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
      serviceName: `${serviceName}`,
      assignPublicIp: false,
      securityGroups: [serviceSG],
      serviceConnectConfiguration: {
        namespace: namespace.namespaceName,
        services: [{
          portMappingName: `${serviceName}-pm`,
          dnsName: `${serviceName}`,
          port: taskPort + 2,
        }],
      },
    });

    const listener = nlb.addListener(`${serviceName}-listener`, {
      port: taskPort,
    })

    fargateService.registerLoadBalancerTargets(
      {
        containerName: containerDef.containerName,
        containerPort: taskPort, //(optional, default: Container port of the first added port mapping)
        newTargetGroupId: `${serviceName}-tg`,
        listener: ListenerConfig.networkListener(listener, {
          port: taskPort,
        })
      }
    );
    fargateService.node.addDependency(namespace);
    return fargateService;
  }

  private deployMSK(myvpc: IVpc): msk.Cluster {
    const kafkasg = new SecurityGroup(this, 'Kafka-sg', {
      securityGroupName: 'kafka-sg',
      vpc: myvpc,
      allowAllOutbound: true
    });

    const mskCluster = new msk.Cluster(this, 'MyKafkaCluster', {
      clusterName: 'my-kafka-cluster',
      kafkaVersion: msk.KafkaVersion.V2_8_0,
      numberOfBrokerNodes: 1,
      encryptionInTransit: {
        clientBroker: msk.ClientBrokerEncryption.PLAINTEXT,
      },
      vpc: myvpc,
      ebsStorageInfo: {
        volumeSize: 5
      },
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      securityGroups: [kafkasg],
      vpcSubnets: myvpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
    });

    return mskCluster;
  }

  private deployVPC(): IVpc {
    const myVpc = new Vpc(this, 'MyVpc', {
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
    return myVpc;
  }

  private deployRDS(myvpc: IVpc): DatabaseInstance {

    const rdsSg = new SecurityGroup(this, 'rds-sg', {
      vpc: myvpc,
      allowAllOutbound: true
    });

    rdsSg.addIngressRule(Peer.anyIpv4(), Port.tcp(5432));
    const subnetGroup = new SubnetGroup(this, 'RDSSubnetGroup', {
      description: 'subnet group for rds',
      vpc: myvpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    this.databaseCredentialsSecret = new Secret(this, 'DBCredentialsSecret', {
      secretName: 'my-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'root',
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    });
    const dbInstance = new DatabaseInstance(this, "PostgresInstance2", {
      databaseName: 'dataflow',
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_14_6 }),
      subnetGroup: subnetGroup,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      vpc: myvpc,
      backupRetention: cdk.Duration.days(0),
      storageType: StorageType.GP2,
      credentials: Credentials.fromSecret(this.databaseCredentialsSecret),
      allocatedStorage: 20,
      publiclyAccessible: false,
      securityGroups: [rdsSg]
    });

    new cdk.CfnOutput(this, 'endpoint', {
      value: dbInstance.instanceEndpoint.hostname,
      exportName: 'endpoint'
    });

    return dbInstance;
  }

  private skipperEnvs(rdsEndpoint: string, rdsPassword: string, rdsUsername: string): { [key: string]: string } {
    const envs = {
      "LANG": 'en_US.utf8',
      "LC_ALL": 'en_US.utf8',
      "JDK_JAVA_OPTIONS": '-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8',
      "SPRING_CLOUD_SKIPPER_SERVER_PLATFORM_LOCAL_ACCOUNTS_DEFAULT_PORTRANGE_LOW": '20000',
      "SPRING_CLOUD_SKIPPER_SERVER_PLATFORM_LOCAL_ACCOUNTS_DEFAULT_PORTRANGE_HIGH": '20190',
      "LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_CLOUD_SKIPPER_SERVER_DEPLOYER": 'ERROR',
      "SPRING_DATASOURCE_URL": `jdbc:postgresql://${rdsEndpoint}:5432/dataflow`,
      "SPRING_DATASOURCE_USERNAME": `${rdsUsername}`,
      "SPRING_DATASOURCE_PASSWORD": `${rdsPassword}`,
      "SPRING_DATASOURCE_DRIVER_CLASS_NAME": 'org.postgresql.Driver',
    }

    return envs;
  }

  private dataflowEnvs(rdsEndpoint: string, rdsPassword: string, rdsUsername: string, brokers: string): { [key: string]: string } {
    const envs = {
      "LANG": 'en_US.utf8',
      "LC_ALL": 'en_US.utf8',
      "JDK_JAVA_OPTIONS": '-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8',
      "SPRINGDOC_APIDOCS_ENABLED": 'true',
      "SPRINGDOC_SWAGGERUI_ENABLED": 'true',
      "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_CLOUD_STREAM_KAFKA_BINDER_BROKERS": `PLAINTEXT://${brokers}`,
      "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_CLOUD_STREAM_KAFKA_STREAMS_BINDER_BROKERS": `PLAINTEXT://${brokers}`,
      "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_STREAM_SPRING_KAFKA_STREAMS_PROPERTIES_METRICS_RECORDING_LEVEL": 'DEBUG',
      "SPRING_CLOUD_DATAFLOW_APPLICATIONPROPERTIES_TASK_SPRING_CLOUD_TASK_CLOSECONTEXTENABLED": 'true',
      "SPRING_CLOUD_SKIPPER_CLIENT_SERVER_URI": 'http://skipper-service:7579/api',
      "SPRING_DATASOURCE_URL": `jdbc:postgresql://${rdsEndpoint}:5432/dataflow`,
      "SPRING_DATASOURCE_USERNAME": `${rdsUsername}`,
      "SPRING_DATASOURCE_PASSWORD": `${rdsPassword}`,
      "SPRING_DATASOURCE_DRIVER_CLASS_NAME": 'org.postgresql.Driver',
    }

    return envs;
  }

  private kafkaClientEnvs(brokers: string): { [key: string]: string } {
    const envs = {
      "KAFKA_BROKERS": brokers,
    }

    return envs;
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
