'use strict';

const s3ObjectCreatedEvent = require('../fixtures/s3-object-created-event.json');
const s3TestEvent = require('../fixtures/s3-test-event.json');
const invalidSqsEvent = require('../fixtures/invalid-sqs-event.json');
const { Logger } = require('../../src/logging/logger');
const { SqsMessageProcessor } = require('../../src/services/sqsMessageProcessor');

function sqsEventWithBody(body, messageId = 'message-1') {
  return {
    Records: [
      {
        messageId,
        body: JSON.stringify(body),
        messageAttributes: {}
      }
    ]
  };
}

describe('SqsMessageProcessor', () => {
  let stepFunctionService;
  let logger;

  beforeEach(() => {
    stepFunctionService = {
      startExecution: jest.fn().mockResolvedValue({
        executionArn: 'execution-arn',
        executionName: 'execution-name',
        duplicateNameRetried: false
      })
    };
    logger = new Logger({ serviceName: 'test-service', logLevel: 'ERROR' });
  });

  test('ignores S3 TestEvent without starting Step Functions', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });

    const result = await processor.process(sqsEventWithBody(s3TestEvent));

    expect(result.results[0]).toMatchObject({
      ignored: true,
      reason: 'S3_TEST_EVENT'
    });
    expect(stepFunctionService.startExecution).not.toHaveBeenCalled();
  });

  test('rejects invalid SQS event', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });

    await expect(processor.process(invalidSqsEvent)).rejects.toMatchObject({
      code: 'INVALID_SQS_RECORD_BODY',
      retryable: false
    });
  });

  test('builds Step Function input for ObjectCreated event', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });

    await processor.process(sqsEventWithBody(s3ObjectCreatedEvent));

    expect(stepFunctionService.startExecution).toHaveBeenCalledTimes(1);
    expect(stepFunctionService.startExecution.mock.calls[0][0]).toMatchObject({
      batchId: 'batch-20260529',
      vendorId: 'prismhr',
      dataType: 'financial',
      payloadType: 'financial',
      fileName: 'batch-20260529_prismhr_PEARL-401K-PLAN-001',
      s3PathOrArn:
        's3://pearl-outbound-dev/outbound/prismhr/financial/batch-20260529/batch-20260529_prismhr_PEARL-401K-PLAN-001.json'
    });
  });

  test('processes multiple SQS records', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });
    const event = {
      Records: [
        {
          messageId: 'message-1',
          body: JSON.stringify(s3ObjectCreatedEvent),
          messageAttributes: {}
        },
        {
          messageId: 'message-2',
          body: JSON.stringify(s3ObjectCreatedEvent),
          messageAttributes: {}
        }
      ]
    };

    const result = await processor.process(event);

    expect(result.processedRecords).toBe(2);
    expect(stepFunctionService.startExecution).toHaveBeenCalledTimes(2);
  });

  test('processes multiple S3 records from one SQS body', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });
    const twoRecordS3Event = {
      Records: [s3ObjectCreatedEvent.Records[0], s3ObjectCreatedEvent.Records[0]]
    };

    const result = await processor.process(sqsEventWithBody(twoRecordS3Event));

    expect(result.results[0].executions).toHaveLength(2);
    expect(stepFunctionService.startExecution).toHaveBeenCalledTimes(2);
  });
});
