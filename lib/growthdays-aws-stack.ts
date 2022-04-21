import {CfnOutput, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {Bucket, BucketEncryption, HttpMethods, StorageClass} from "aws-cdk-lib/aws-s3";
import {AccountRootPrincipal} from "aws-cdk-lib/aws-iam";

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
      ]
    });

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

    const cfnOutput = new CfnOutput(this, 'WebAppURL',{
      value: `https://${s3Bucket.bucketDomainName}/index.html`,
      description: 'The URL for out WebApp',
      exportName: 'webAppURL'
    })
  }
}
