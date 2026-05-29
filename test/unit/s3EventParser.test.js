'use strict';

const s3ObjectCreatedEvent = require('../fixtures/s3-object-created-event.json');
const s3TestEvent = require('../fixtures/s3-test-event.json');
const {
  decodeS3ObjectKey,
  isS3TestEvent,
  parseObjectCreatedEvents,
  parseSqsBody
} = require('../../src/services/s3EventParser');

describe('s3EventParser', () => {
  test('identifies S3 TestEvent safely', () => {
    expect(isS3TestEvent(s3TestEvent)).toBe(true);
  });

  test('parses ObjectCreated event and extracts decoded bucket/key', () => {
    const events = parseObjectCreatedEvents(s3ObjectCreatedEvent, 'message-1');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      bucketName: 'pearl-outbound-dev',
      objectKey:
        'outbound/prismhr/financial/batch-20260529/batch-20260529_prismhr_PEARL-401K-PLAN-001.json',
      eventType: 'ObjectCreated:Put',
      sourceMessageId: 'message-1'
    });
  });

  test('URL-decodes S3 object keys', () => {
    expect(decodeS3ObjectKey('outbound/prismhr/financial/file+with%20spaces.json')).toBe(
      'outbound/prismhr/financial/file with spaces.json'
    );
  });

  test('rejects invalid SQS body JSON', () => {
    expect(() => parseSqsBody('{not-json')).toThrow('SQS record body must be valid JSON');
  });
});
