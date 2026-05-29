'use strict';

const { PearlError } = require('../errors/pearlError');
const { validateS3ObjectCreatedRecord } = require('../validators/messageValidator');

function parseSqsBody(body) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new PearlError('SQS record body must be valid JSON.', {
      code: 'INVALID_SQS_BODY_JSON',
      retryable: false,
      statusCode: 400,
      details: {
        cause: error.message
      }
    });
  }
}

function isS3TestEvent(payload) {
  return payload?.Service === 'Amazon S3' && payload?.Event === 's3:TestEvent';
}

function parseObjectCreatedEvents(payload, sourceMessageId) {
  if (!payload || !Array.isArray(payload.Records) || payload.Records.length === 0) {
    throw new PearlError('S3 event payload must contain at least one Records entry.', {
      code: 'INVALID_S3_EVENT',
      retryable: false,
      statusCode: 400
    });
  }

  return payload.Records.map((record) => {
    validateS3ObjectCreatedRecord(record);

    const rawKey = record.s3.object.key;
    const objectKey = decodeS3ObjectKey(rawKey);
    const bucketName = record.s3.bucket.name;

    return {
      bucketName,
      objectKey,
      eventType: record.eventName,
      eventTime: record.eventTime || null,
      awsRegion: record.awsRegion || null,
      objectSize: record.s3.object.size ?? null,
      eTag: record.s3.object.eTag || null,
      sequencer: record.s3.object.sequencer || null,
      sourceMessageId
    };
  });
}

function decodeS3ObjectKey(key) {
  return decodeURIComponent(String(key).replace(/\+/g, ' '));
}

module.exports = {
  parseSqsBody,
  isS3TestEvent,
  parseObjectCreatedEvents,
  decodeS3ObjectKey
};
