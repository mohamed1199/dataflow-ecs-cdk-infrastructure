# AWS CDK Project for Deploying Spring Dataflow Microservices

![Alt text](images/arch1.jpg?raw=true "infra architecture")

# The infrastructure from network perspective


![Alt text](images/arch2.jpg?raw=true "infra architecture")

## About the Architecture

The following AWS architecture consists of two public subnets, each deployed in a different Availability Zone (AZ) and associated with a Network Load Balancer (NLB) and two NAT Gateways. There are also two private subnets associated with an ECS cluster, an Amazon Managed Streaming for Apache Kafka (MSK) cluster, and a Relational Database Service (RDS) instance.

The public subnets host the NLB and NAT Gateways, which provide connectivity to the Internet and enable the private subnets to communicate with external services such as ECR, CloudWatch or other AWS resources. 

The NLB distributes incoming traffic to a pool of target instances running in the private subnets. 

The NAT Gateways allow instances in the private subnet to access the Internet while keeping them protected from direct Internet traffic.

The private subnets host the ECS tasks, MSK cluster, and RDS instance. The ECS tasks are launched in a containerized environment using Amazon ECS Fargate.

The architecture is designed for high availability and fault tolerance. By deploying the public subnets in different AZs, the architecture ensures that there is no single point of failure. If one AZ experiences an outage, the other AZ can continue to provide services.

## Prerequisites

Before deploying this project, make sure you have the following prerequisites:

  * An AWS account with administrative privileges.
  * AWS CLI (Command Line Interface) installed on your local machine.
  * Node.js and npm installed on your local machine.
  * AWS CDK (version 2.73.0 or later) installed on your local machine.
  * An IAM user with the necessary permissions to deploy the infrastructure.

## Deployment

To deploy the infrastructure, follow these steps:

   * Clone the repository to your local machine.
   * Open a terminal and navigate to the root folder of the project.
   * Run `npm install` to install the dependencies.
   * Configure your AWS credentials by running aws configure.
   * Run `cdk bootstrap` to create the required resources in your AWS account.
   * Run `cdk deploy --all --require-approval never` to deploy the infrastructure.

