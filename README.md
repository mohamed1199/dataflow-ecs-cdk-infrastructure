# AWS CDK Project for Deploying Spring Dataflow Microservices

![Alt text](images/arch1.jpg?raw=true "infra architecture")

# The infrastructure from network perspective

![Alt text](images/arch2.jpg?raw=true "infra architecture")

## About the Infrastructure

The following AWS architecture consists of two public subnets, each deployed in a different Availability Zone (AZ) and associated with a Network Load Balancer (NLB) and two NAT Gateways. There are also two private subnets associated with an ECS cluster, an Amazon Managed Streaming for Apache Kafka (MSK) cluster, and a Relational Database Service (RDS) instance.

The public subnets host the NLB and NAT Gateways, which provide connectivity to the Internet and enable the private subnets to communicate with external services such as ECR, CloudWatch or other AWS resources. 

The NLB distributes incoming traffic to a pool of target ECS tasks running in the private subnets. 

The NAT Gateways allow ECS tasks in the private subnet to access the Internet while keeping them protected from direct Internet traffic.

The private subnets host the ECS tasks, MSK cluster, and RDS instance. The ECS tasks are launched in a containerized environment using Amazon ECS Fargate.

The architecture is designed for high availability and fault tolerance. By deploying the public an private subnets in different AZs, the architecture ensures that there is no single point of failure. If one AZ experiences an outage, the other AZ can continue to provide services.

## Project Stacks

| Stack Name           | Description                                          |
|----------------------|------------------------------------------------------|
| NetworkStack         | Creates the network infrastructure for the project.  |
| RdsStack             | Sets up the Amazon RDS database for the application. |
| MskClusterStack      | Creates an Amazon MSK cluster for event streaming with 2 brokers.   |
| SkipperStack         | Configures the Skipper service and deploy into ECS fargate.  |
| DataflowStack        | Configures the Dataflow service and deploy into ECS fargate.  |
| KafkaClientStack     | Creates a client application for Kafka interaction.  |
| AppStreamStack       | Configures Amazon AppStream for application streaming. |

## Prerequisites

Before deploying this project, make sure you have the following prerequisites:

  * An AWS account with administrative privileges.
  * AWS CLI (Command Line Interface) installed on your local machine.
  * Node.js and npm installed on your local machine.
  * AWS CDK (version 2.73.0 or later) installed on your local machine.
  * An IAM user with the necessary permissions to deploy the infrastructure.


## Manual Deployment

To deploy the infrastructure, follow these steps:

   * you need to configure each microservice including creating an ECR repository, pulling the image, tagging it, and pushing it to ECR.
   * Clone the repository to your local machine.
   * Open a terminal and navigate to the root folder of the project.
   * Run `npm install` to install the dependencies.
   * Run `npm i -force @aws-cdk/aws-msk-alpha` to force installing the msk library.
   * Configure your AWS credentials by running aws configure.
   * Run `cdk bootstrap` to create the required resources in your AWS account.
   * Run `cdk deploy --all --require-approval never` to deploy the infrastructure.

## Automatic Deployment using Jenkins

![Alt text](images/infra-pipe.jpg?raw=true "Infra Pipeline")

This a Jenkins pipeline performs several stages to configure and deploy the full infrastructure. Let's break down each stage:

1. **Skipper Configuration**: This stage sets up the Skipper server, which is part of the Spring Cloud Data Flow platform. It performs the following steps:
   - Authenticates Docker to the ECR repository using AWS credentials.
   - Creates an ECR repository named "skipper" in the specified AWS region.
   - Pulls the Docker image for Spring Cloud Skipper Server version 2.11.0-SNAPSHOT.
   - Tags the Docker image with the ECR repository URL and the "latest" tag.
   - Pushes the Docker image to the ECR repository.

2. **Dataflow Configuration**: This stage sets up the Dataflow server, another component of the Spring Cloud Data Flow. It performs similar steps as the Skipper Configuration including creating an ECR repository, pulling the Docker image, tagging it, and pushing it to the ECR repository.

3. **Kafka Configuration**: This stage sets up the Kafka client. It performs similar steps as the previous stages to create an ECR repository, pull the Docker image for the Kafka console, tag it, and push it to the ECR repository.

4. **AppStream Configuration**: This stage sets up the AppStream base image. It performs similar steps as the previous stages to create an ECR repository, pull the Docker image for the Spring Cloud base image version 1.0.4, tag it, and push it to the ECR repository.

5. **Install Dependencies**: This stage installs the required dependencies for the pipeline. It runs two npm commands to install the `aws-cdk-lib` and `@aws-cdk/aws-msk-alpha` packages.

6. **Deploy the Infrastructure**: This stage deploys the infrastructure using the AWS Cloud Development Kit (CDK). It performs the following steps:
   - Authenticates AWS credentials.
   - Runs the `cdk bootstrap` command to set up the necessary resources for CDK deployment.
   - Runs the `cdk deploy` command with the `--all` flag to deploy all resources defined in the CDK stack.
   - Uses the `--require-approval never` flag to automatically approve the deployment.

## CI/CD Pipeline

![Alt text](images/ci_cd_pipe.png?raw=true "CI/CD Pipeline")

The pipeline consists of several stages, each representing a specific phase of the software delivery process. Here's an overview of the stages:

  - Checkout: This stage checks out the code from the Git repository.
  - Build: This stage builds the Spring Boot microservice using Gradle.
  - Test: This stage runs automated tests on the microservice.
  - Dockerize: This stage creates Docker images for the microservice with custom version tag and latest tag.(technique for preventing tags overwrite)
  - Push to ECR: This stage pushes the Docker images to the Amazon Elastic Container Registry (ECR).
  - Update ECS Service: This stage updates the ECS service with a new deployment to the latest version of the Docker image.

The following workflow provides a summary of the updating process in ECS:

![Alt text](images/update_ecs.png?raw=true "ECS Workflow")