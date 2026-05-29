'use strict';

const { PearlError } = require('../errors/pearlError');

function validateSqsEvent(event) {
  if (!event || !Array.isArray(event.Records)) {
    throw new PearlError('SQS event must contain a Records array.', {
      code: 'INVALID_SQS_EVENT',
      retryable: false,
      statusCode: 400
    });
  }

  if (event.Records.length === 0) {
    throw new PearlError('SQS event Records array must not be empty.', {
      code: 'EMPTY_SQS_EVENT',
      retryable: false,
      statusCode: 400
    });
  }
}

function validateSqsRecord(record) {
  if (!record || typeof record.body !== 'string' || record.body.trim() === '') {
    throw new PearlError('SQS record body is required.', {
      code: 'INVALID_SQS_RECORD_BODY',
      retryable: false,
      statusCode: 400
    });
  }
}

function validateS3ObjectCreatedRecord(record) {
  const bucketName = record?.s3?.bucket?.name;
  const objectKey = record?.s3?.object?.key;
  const eventName = record?.eventName;

  if (!bucketName || typeof bucketName !== 'string') {
    throw new PearlError('S3 bucket name is required.', {
      code: 'MISSING_S3_BUCKET',
      retryable: false,
      statusCode: 400
    });
  }

  if (!objectKey || typeof objectKey !== 'string') {
    throw new PearlError('S3 object key is required.', {
      code: 'MISSING_S3_OBJECT_KEY',
      retryable: false,
      statusCode: 400
    });
  }

  if (!eventName || !eventName.startsWith('ObjectCreated:')) {
    throw new PearlError(`Unsupported S3 event type: ${eventName || 'unknown'}.`, {
      code: 'UNSUPPORTED_S3_EVENT',
      retryable: false,
      statusCode: 400
    });
  }
}

function validateStateMachineArn(stateMachineArn) {
  if (!stateMachineArn || typeof stateMachineArn !== 'string' || stateMachineArn.trim() === '') {
    throw new PearlError('STATE_MACHINE_ARN environment variable is required.', {
      code: 'MISSING_STATE_MACHINE_ARN',
      retryable: false,
      statusCode: 500
    });
  }
}

module.exports = {
  validateSqsEvent,
  validateSqsRecord,
  validateS3ObjectCreatedRecord,
  validateStateMachineArn
};
