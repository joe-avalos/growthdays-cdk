import {CfnOutput, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import {Bucket, BucketEncryption, HttpMethods, StorageClass} from "aws-cdk-lib/aws-s3";
import {Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion} from "aws-cdk-lib/aws-rds";
import {Cluster, ContainerImage, FargateTaskDefinition} from "aws-cdk-lib/aws-ecs";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {ManagedPolicy, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GrowthdaysAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // CHANGE: We have created the vpc object from the Vpc class.
    const vpc = new Vpc(this, 'MainVpc',{

      // CHANGE: this is where we define how many AZs to use
      maxAzs: 2,

      // CHANGE: We define a single subnet configuration per AZ.
      subnetConfiguration:  [
        {
          // CHANGE: this is it's CIDR mask so 255.255.255.0
          cidrMask: 24,

          // CHANGE: a name for each of these subnets
          name: 'public-subnet',

          // CHANGE: and the subnet type to be used - here we will have
          // a public subnet. There are other options available here.
          subnetType: SubnetType.PUBLIC
        },
        {
          // CHANGE: this is it's CIDR mask so 255.255.255.0
          cidrMask: 28,

          // CHANGE: a name for each of these subnets
          name: 'isolated-subnet',

          // CHANGE: and the subnet type to be used - here we will have
          // a public subnet. There are other options available here.
          subnetType: SubnetType.PRIVATE_ISOLATED
        },
      ],
      enableDnsSupport: true,
    });

    const ec2InstanceSG = new SecurityGroup(this, 'ec2-instance-sg',{
      vpc
    })

    ec2InstanceSG.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(22),
        'allow SSH connections from anywhere'
    )

    const ec2Instance = new Instance(this, 'ec2-instance',{
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
      securityGroup: ec2InstanceSG,
      instanceType: InstanceType.of(
          InstanceClass.T2,
          InstanceSize.MICRO,
      ),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: 'GrowthDaysKeyPair'
    })

    const dbInstance = new DatabaseInstance(this, 'db-instance', {
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_13_3,
      }),
      instanceType: InstanceType.of(
          InstanceClass.BURSTABLE3,
          InstanceSize.MICRO,
      ),
      credentials: Credentials.fromGeneratedSecret('postgres'),
      multiAz: false,
      allocatedStorage: 100,
      maxAllocatedStorage: 105,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: 'growthDays',
      publiclyAccessible: false,
    })

    dbInstance.connections.allowFrom(ec2Instance, Port.tcp(5432))

    const ecsCluster = new Cluster(this, 'MyCluster', {
      vpc,
    })

    // const containerRegistry = new Repository(this, 'ContainerRegistry', {
    //   repositoryName: 'growth-days',
    //   imageScanOnPush: true,
    //   removalPolicy: RemovalPolicy.DESTROY
    // })
    // const execRole = new Role(this, 'MyAppTaskExecutionRole-', {
    //   assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    // })
    // execRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonECSTaskExecutionRolePolicy'))

    // const containerTaskRole = new Role(this, 'MyAppTaskRole-', {
    //   assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    // })
    // containerTaskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'))
    // containerTaskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'))

    // const gdTaskDef = new FargateTaskDefinition(this, 'gdTaskDef', {
    //   cpu: 512,
    //   memoryLimitMiB: 2048,
    //   executionRole: execRole,
    //   taskRole: containerTaskRole,
    // })

    // const repo = Repository.fromRepositoryName(this, 'someRepo', 'growth-days')
    // const image = ContainerImage.fromEcrRepository(repo, 'latest')
    // const image = ContainerImage.fromRegistry("amazon/amazon-ecs-sample")
    // gdTaskDef.addContainer('container-taskdef-growth-days', {
    //   image,
    //   containerName: repo.repositoryName,
    //   portMappings: [
    //     { containerPort: 3000, hostPort: 3000 }
    //   ]
    // })
    const service = new ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      cluster: ecsCluster,
      serviceName: 'growth-days-service',
      // taskDefinition: gdTaskDef,
      taskImageOptions:{
        image: ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
        containerPort: 3000,
      },
      assignPublicIp: true,
      publicLoadBalancer: true,
    })

    const s3Bucket = new Bucket(this, 's3-bucket',{
      // bucketName: 'growth-days-bucket', // not recommended for globally unique name
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      encryption: BucketEncryption.S3_MANAGED,
      websiteIndexDocument: 'index.html',
      cors: [
        {
          allowedMethods: [
              HttpMethods.GET,
              HttpMethods.POST,
              HttpMethods.PUT,
              HttpMethods.DELETE
          ],
          allowedOrigins: ['*'],
          allowedHeaders:  ['*']
        }
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(90),
          expiration: Duration.days(56),
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30)
            }
          ]
        }
      ]
    })

    const webAppURLOutput = new CfnOutput(this, 'WebAppURL',{
      value: `https://${s3Bucket.bucketDomainName}/index.html`,
      description: 'The URL for out WebApp',
      exportName: 'webAppURL'
    })
    const dbEndpointOutput = new CfnOutput(this, 'dbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname
    })
    const secretNameOutput = new CfnOutput(this, 'secretName',{
      // @ts-ignore
      value: dbInstance.secret?.secretName
    })
    // const repositoryUriOutput = new CfnOutput(this, 'repositoryUri',{
    //   value: containerRegistry.repositoryUri
    // })
    // const repositoryNameOutput = new CfnOutput(this, 'repositoryName',{
    //   value: containerRegistry.repositoryName
    // })
    // const repositoryArnOutput = new CfnOutput(this, 'repositoryArn',{
    //   value: containerRegistry.repositoryArn
    // })
  }
}
