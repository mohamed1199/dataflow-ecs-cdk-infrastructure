# AWS CDK Project for Deploying Spring Dataflow Microservices

![Alt text](images/dataflow.jpeg?raw=true "infra architecture")

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
   * Run `cdk deploy` to deploy the infrastructure.
