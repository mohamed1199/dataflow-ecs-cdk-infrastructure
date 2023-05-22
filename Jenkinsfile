pipeline {
  agent any

  environment {
      ACCOUNT_ID = "847759515844"
      REGION = "us-east-1"
    }

  stages {

    stage('Skipper Configuration') {
      steps {
        withAWS(credentials: 'aws-access-key-id', region: "${REGION}") {
        sh "aws ecr create-repository --repository-name skipper --region ${REGION}"
        sh "docker pull springcloud/spring-cloud-skipper-server:2.11.0-SNAPSHOT"
        sh "docker tag springcloud/spring-cloud-skipper-server:2.11.0-SNAPSHOT ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/skipper:latest"
        sh "docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/skipper:latest"
       }
     }
    }

    stage('Dataflow Configuration') {
      steps {
        withAWS(credentials: 'aws-access-key-id', region: "${REGION}") {
        sh "aws ecr create-repository --repository-name dataflow --region ${REGION}"
        sh "docker pull springcloud/spring-cloud-dataflow-server:2.11.0-SNAPSHOT"
        sh "docker tag springcloud/spring-cloud-dataflow-server:2.11.0-SNAPSHOT ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/dataflow:latest"
        sh "docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/dataflow:latest"
       }
      }
    }

    stage('kafka Configuration') {
      steps {
        withAWS(credentials: 'aws-access-key-id', region: "${REGION}") {
        sh "aws ecr create-repository --repository-name kafka --region ${REGION}"
        sh "docker pull docker.redpanda.com/vectorized/console:latest"
        sh "docker tag docker.redpanda.com/vectorized/console:latest ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/kafka:latest"
        sh "docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/kafka:latest"
       }
      }
    }

    stage('AppStream Configuration') {
      steps {
        withAWS(credentials: 'aws-access-key-id', region: "${REGION}") {
        sh "aws ecr create-repository --repository-name baseimage --region ${REGION}"
        sh "docker pull springcloud/baseimage:1.0.4"
        sh "docker tag springcloud/baseimage:1.0.4 ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/baseimage:latest"
        sh "docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/baseimage:latest"
       }
      }
    }
    
    stage('Install Dependencies') {
         steps {
                sh "npm install aws-cdk-lib"
                sh "npm i -force @aws-cdk/aws-msk-alpha"
            }
    }
   
    stage('Deploy the Infrastructure') {
            steps {
                withAWS(credentials: 'aws-access-key-id', region: "${REGION}") {
                sh "cdk bootstrap"
                sh "cdk deploy --all --require-approval never"
            }
      }  
    }   
  }
}