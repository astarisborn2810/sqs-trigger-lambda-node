'use strict';

function getAppConfig(env = process.env) {
  return {
    awsRegion: env.AWS_REGION || 'us-east-1',
    stateMachineArn: env.STATE_MACHINE_ARN,
    logLevel: (env.LOG_LEVEL || 'INFO').toUpperCase(),
    serviceName: env.SERVICE_NAME || 'pearl-sqs-trigger-lambda-node',
    idempotencyTableName: env.IDEMPOTENCY_TABLE_NAME,
    idempotencyTtlDays: positiveInteger(env.IDEMPOTENCY_TTL_DAYS, 91),
    idempotencyInProgressTtlSeconds: positiveInteger(
      env.IDEMPOTENCY_IN_PROGRESS_TTL_SECONDS,
      900
    )
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  getAppConfig
};
