'use strict';

function getAppConfig(env = process.env) {
  return {
    awsRegion: env.AWS_REGION || 'us-east-1',
    stateMachineArn: env.STATE_MACHINE_ARN,
    logLevel: (env.LOG_LEVEL || 'INFO').toUpperCase(),
    serviceName: env.SERVICE_NAME || 'pearl-sqs-trigger-lambda-node'
  };
}

module.exports = {
  getAppConfig
};
