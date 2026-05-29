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
        's3://pearl-outbound-dev/outbound/prismhr/financial/batch-20260529/batch-20260529_prismhr_PEARL-401K-PLAN-001.json',
      metadata: expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^s3event#/)
      })
    });
  });

  test('uses SQS message attributes to override inferred correlation metadata', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });
    const event = {
      Records: [
        {
          messageId: 'message-attributes',
          body: JSON.stringify(s3ObjectCreatedEvent),
          messageAttributes: {
            correlationId: { stringValue: 'corr-test-001' },
            batchId: { stringValue: 'batch-override' },
            vendorId: { stringValue: 'vendor-override' },
            dataType: { stringValue: 'indicative' }
          }
        }
      ]
    };

    await processor.process(event);

    expect(stepFunctionService.startExecution.mock.calls[0][0]).toMatchObject({
      correlationId: 'corr-test-001',
      batchId: 'batch-override',
      vendorId: 'vendor-override',
      dataType: 'indicative',
      payloadType: 'indicative',
      sourceMessageId: 'message-attributes'
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

  test('rejects missing S3 bucket without starting Step Functions', async () => {
    const processor = new SqsMessageProcessor({ stepFunctionService, logger });
    const invalidS3Event = {
      Records: [
        {
          eventName: 'ObjectCreated:Put',
          s3: {
            bucket: {},
            object: {
              key: 'outbound/prismhr/financial/batch-20260529/file.json'
            }
          }
        }
      ]
    };

    await expect(processor.process(sqsEventWithBody(invalidS3Event))).rejects.toMatchObject({
      code: 'MISSING_S3_BUCKET'
    });
    expect(stepFunctionService.startExecution).not.toHaveBeenCalled();
  });

  test('skips duplicate completed S3 event without starting Step Functions', async () => {
    const idempotencyStore = {
      claim: jest.fn().mockResolvedValue({
        idempotencyKey: 's3event#duplicate',
        duplicateCompleted: true,
        inProgress: false,
        acquired: false,
        existingStatus: 'STARTED'
      }),
      markStarted: jest.fn(),
      release: jest.fn()
    };
    const processor = new SqsMessageProcessor({ stepFunctionService, idempotencyStore, logger });

    const result = await processor.process(sqsEventWithBody(s3ObjectCreatedEvent));

    expect(result.results[0].executions[0]).toMatchObject({
      duplicate: true,
      idempotencyKey: 's3event#duplicate'
    });
    expect(stepFunctionService.startExecution).not.toHaveBeenCalled();
    expect(idempotencyStore.markStarted).not.toHaveBeenCalled();
  });

  test('fails in-progress duplicate S3 event so SQS can retry', async () => {
    const idempotencyStore = {
      claim: jest.fn().mockResolvedValue({
        idempotencyKey: 's3event#in-progress',
        duplicateCompleted: false,
        inProgress: true,
        acquired: false,
        existingStatus: 'STARTING'
      }),
      markStarted: jest.fn(),
      release: jest.fn()
    };
    const processor = new SqsMessageProcessor({ stepFunctionService, idempotencyStore, logger });

    await expect(processor.process(sqsEventWithBody(s3ObjectCreatedEvent))).rejects.toMatchObject({
      code: 'S3_EVENT_IN_PROGRESS',
      retryable: true
    });
    expect(stepFunctionService.startExecution).not.toHaveBeenCalled();
  });

  test('marks idempotency record started after Step Functions starts', async () => {
    const claim = {
      idempotencyKey: 's3event#acquired',
      duplicateCompleted: false,
      inProgress: false,
      acquired: true
    };
    const idempotencyStore = {
      claim: jest.fn().mockResolvedValue(claim),
      markStarted: jest.fn(),
      release: jest.fn()
    };
    const processor = new SqsMessageProcessor({ stepFunctionService, idempotencyStore, logger });

    await processor.process(sqsEventWithBody(s3ObjectCreatedEvent));

    expect(idempotencyStore.markStarted).toHaveBeenCalledWith(
      claim,
      expect.objectContaining({
        executionArn: 'execution-arn',
        executionName: 'execution-name'
      })
    );
  });

  test('releases idempotency claim when Step Functions startup fails', async () => {
    const startupError = new Error('Step Functions unavailable');
    stepFunctionService.startExecution.mockRejectedValue(startupError);
    const claim = {
      idempotencyKey: 's3event#acquired',
      duplicateCompleted: false,
      inProgress: false,
      acquired: true
    };
    const idempotencyStore = {
      claim: jest.fn().mockResolvedValue(claim),
      markStarted: jest.fn(),
      release: jest.fn()
    };
    const processor = new SqsMessageProcessor({ stepFunctionService, idempotencyStore, logger });

    await expect(processor.process(sqsEventWithBody(s3ObjectCreatedEvent))).rejects.toThrow(
      'Step Functions unavailable'
    );
    expect(idempotencyStore.release).toHaveBeenCalledWith(claim, startupError);
    expect(idempotencyStore.markStarted).not.toHaveBeenCalled();
  });
});
