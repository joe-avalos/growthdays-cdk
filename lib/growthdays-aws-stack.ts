import {CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {InstanceClass, InstanceSize, InstanceType, Port, SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {
    Credentials,
    DatabaseInstance,
    DatabaseInstanceEngine,
    PostgresEngineVersion
} from "aws-cdk-lib/aws-rds";
import {Cluster, ContainerImage} from "aws-cdk-lib/aws-ecs";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {Bucket, BucketEncryption, HttpMethods, StorageClass} from "aws-cdk-lib/aws-s3";

export class GrowthdaysAwsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const vpc = new Vpc(this, 'MainVpc', {
            maxAzs: 2,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'public-subnet',
                    subnetType: SubnetType.PUBLIC
                },
                {
                    cidrMask: 28,
                    name: 'isolated-subnet',
                    subnetType: SubnetType.PRIVATE_ISOLATED
                },
            ],
            enableDnsSupport: true,
        });
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

        const dbPass = SecretValue.secretsManager(<string>rdsInstance.secret?.secretName, {
            jsonField: 'password'
        })

        const dbUser = SecretValue.secretsManager(<string>rdsInstance.secret?.secretName, {
            jsonField: 'username'
        })

        const dbName = SecretValue.secretsManager(<string>rdsInstance.secret?.secretName, {
            jsonField: 'dbname'
        })

        const dbPort = SecretValue.secretsManager(<string>rdsInstance.secret?.secretName, {
            jsonField: 'port'
        })

        const fgService = new ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
            cluster: ecsCluster,
            serviceName: 'growth-days-service',
            taskImageOptions: {
                image,
                environment: {
                    DB_HOST: rdsInstance.instanceEndpoint.hostname.toString(),
                    DB_NAME: <string><unknown>dbName,
                    DB_USER: <string><unknown>dbUser,
                    DB_PASSWORD: <string><unknown>dbPass,
                    DB_PORT: <string><unknown>dbPort
                }
            },
            assignPublicIp: true,
            publicLoadBalancer: true,
        })

        rdsInstance.connections.allowFrom(fgService.service, Port.tcp(5432))

        const s3Bucket = new Bucket(this, 's3-bucket',{
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
            value: rdsInstance.instanceEndpoint.hostname
        })
        const secretNameOutput = new CfnOutput(this, 'secretName', {
            value: <string>rdsInstance.secret?.secretName
        })
    }
}
