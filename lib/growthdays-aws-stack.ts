import {CfnOutput, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {InstanceClass, InstanceSize, InstanceType, Port, SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {
  Credentials,
  DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion
} from "aws-cdk-lib/aws-rds";
import {Cluster, ContainerImage} from "aws-cdk-lib/aws-ecs";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";
import {Repository} from "aws-cdk-lib/aws-ecr";

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

    // const ec2InstanceSG = new SecurityGroup(this, 'ec2-instance-sg',{
    //   vpc
    // })
    //
    // ec2InstanceSG.addIngressRule(
    //     Peer.anyIpv4(),
    //     Port.tcp(22),
    //     'allow SSH connections from anywhere'
    // )
    //
    // const ec2Instance = new Instance(this, 'ec2-instance',{
    //   vpc,
    //   vpcSubnets: {
    //     subnetType: SubnetType.PUBLIC,
    //   },
    //   securityGroup: ec2InstanceSG,
    //   instanceType: InstanceType.of(
    //       InstanceClass.T2,
    //       InstanceSize.MICRO,
    //   ),
    //   machineImage: new AmazonLinuxImage({
    //     generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
    //   }),
    //   keyName: 'GrowthDaysKeyPair'
    // })
    //
    const rdsInstance = new DatabaseInstance(this, 'Database', {
      engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_13_3}),
      credentials: Credentials.fromGeneratedSecret('postgres'),
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MICRO),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      vpc,
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
    // const dbInstance = new DatabaseInstance(this, 'db-instance', {
    //   vpc,
    //   vpcSubnets: {
    //     subnetType: SubnetType.PRIVATE_ISOLATED,
    //   },
    //   engine: DatabaseInstanceEngine.postgres({
    //     version: PostgresEngineVersion.VER_13_3,
    //   }),
    //   instanceType: InstanceType.of(
    //       InstanceClass.BURSTABLE3,
    //       InstanceSize.MICRO,
    //   ),
    //   credentials: Credentials.fromGeneratedSecret('postgres'),
    //   multiAz: false,
    //   allocatedStorage: 100,
    //   maxAllocatedStorage: 105,
    //   allowMajorVersionUpgrade: false,
    //   autoMinorVersionUpgrade: true,
    //   backupRetention: Duration.days(0),
    //   deleteAutomatedBackups: true,
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   deletionProtection: false,
    //   databaseName: 'growthDays',
    //   publiclyAccessible: false,
    // })
    //
    // dbInstance.connections.allowFrom(ec2Instance, Port.tcp(5432))

    const ecsCluster = new Cluster(this, 'MyCluster', {
      vpc,
      clusterName: 'growth-days-cluster'
    })

    const containerRegistry = new Repository(this, 'ContainerRegistry', {
      repositoryName: 'growth-days',
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const repo = Repository.fromRepositoryName(this, 'someRepo', 'growth-days')
    const image = ContainerImage.fromEcrRepository(repo, 'latest')

    const fgService = new ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      cluster: ecsCluster,
      serviceName: 'growth-days-service',
      taskImageOptions:{
        image,
        environment: {
          DB_HOST: rdsInstance.instanceEndpoint.hostname.toString(),
          DB_NAME: 'growthDays',
          DB_USER: 'postgres',
          // @ts-ignore
          DB_PASSWORD: rdsInstance.secret.secretValue.password,
          DB_PORT: '5432'
        }
        // containerPort: 80,
      },
      assignPublicIp: true,
      publicLoadBalancer: true,
    })
    // service.service.connections.allowTo(rdsInstance, Port.tcp(5432))
    rdsInstance.connections.allowFrom(fgService.service, Port.tcp(5432))

    // const s3Bucket = new Bucket(this, 's3-bucket',{
    //   // bucketName: 'growth-days-bucket', // not recommended for globally unique name
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   autoDeleteObjects: true,
    //   versioned: false,
    //   publicReadAccess: false,
    //   encryption: BucketEncryption.S3_MANAGED,
    //   websiteIndexDocument: 'index.html',
    //   cors: [
    //     {
    //       allowedMethods: [
    //           HttpMethods.GET,
    //           HttpMethods.POST,
    //           HttpMethods.PUT,
    //           HttpMethods.DELETE
    //       ],
    //       allowedOrigins: ['*'],
    //       allowedHeaders:  ['*']
    //     }
    //   ],
    //   lifecycleRules: [
    //     {
    //       abortIncompleteMultipartUploadAfter: Duration.days(90),
    //       expiration: Duration.days(56),
    //       transitions: [
    //         {
    //           storageClass: StorageClass.INFREQUENT_ACCESS,
    //           transitionAfter: Duration.days(30)
    //         }
    //       ]
    //     }
    //   ]
    // })
    //
    // const webAppURLOutput = new CfnOutput(this, 'WebAppURL',{
    //   value: `https://${s3Bucket.bucketDomainName}/index.html`,
    //   description: 'The URL for out WebApp',
    //   exportName: 'webAppURL'
    // })
    const dbEndpointOutput = new CfnOutput(this, 'dbEndpoint', {
      value: rdsInstance.instanceEndpoint.hostname
    })
    const secretNameOutput = new CfnOutput(this, 'secretName',{
      // @ts-ignore
      value: rdsInstance.secret?.secretName
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
