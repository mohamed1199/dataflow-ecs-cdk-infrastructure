# AWS CDK Project for Provisioning an Infrastructure for Microservices

![Alt text](images/arch.png?raw=true "Optional Title")

## Prerequisites

Before deploying this project, make sure you have the following prerequisites:

  * An AWS account with administrative privileges.
  * AWS CLI (Command Line Interface) installed on your local machine.
  * Node.js and npm installed on your local machine.
  * AWS CDK (version 2.73.0 or later) installed on your local machine.
  * An IAM user with the necessary permissions to deploy the infrastructure.

## Deployment

To get started you need to create (using aws console) 3 subnets with the following configuration:
   * Create a custom VPC 
   * One Public and One Private subnet in the same AZ (us-east-1a)
   * Another Public subnet in another and different AZ (ex: us-east-1b)

![Alt text](images/net.png?raw=true "Optional Title")   

To deploy the infrastructure, follow these steps:

   * Clone the repository to your local machine.
   * Open a terminal and navigate to the root folder of the project.
   * Run `npm install` to install the dependencies.
   * Configure your AWS credentials by running aws configure.
   * Run `cdk bootstrap` to create the required resources in your AWS account.
   * Run `cdk deploy` to deploy the infrastructure.

## You will find here the code of the two microservices including CI/CD    Pipeline (Look at the Jenkinsfile):
### [User service Repo](https://github.com/mohamed1199/user-service.git)
### [Admin service Repo](https://github.com/mohamed1199/user-service.git)
