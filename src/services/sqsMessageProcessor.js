'use strict';

const { Logger } = require('../logging/logger');
const { buildStepFunctionInput } = require('../models/stepFunctionInput');
const { validateSqsEvent, validateSqsRecord } = require('../validators/messageValidator');
const { createCorrelationContext } = require('./correlationService');
const { createIdempotencyStore } = require('./idempotencyStore');
const { isS3TestEvent, parseObjectCreatedEvents, parseSqsBody } = require('./s3EventParser');
const { StepFunctionService } = require('./stepFunctionService');
const { PearlError } = require('../errors/pearlError');

class SqsMessageProcessor {
  constructor(options = {}) {
    this.stepFunctionService = options.stepFunctionService || new StepFunctionService(options);
    this.idempotencyStore = options.idempotencyStore || createIdempotencyStore(options);
    this.logger = options.logger || new Logger(options.config);
  }

  async process(event) {
    validateSqsEvent(event);

    const results = [];
    for (const record of event.Records) {
      results.push(await this.processRecord(record));
    }

    return {
      processedRecords: event.Records.length,
      results
    };
  }

  async processRecord(record) {
    validateSqsRecord(record);

    const payload = parseSqsBody(record.body);
    if (isS3TestEvent(payload)) {
      this.logger.info('Ignoring S3 test event.', {
        correlationId: null,
        batchId: null,
        vendorId: null,
        dataType: null
      });
      return {
        ignored: true,
        reason: 'S3_TEST_EVENT',
        executions: []
      };
    }

    const s3Events = parseObjectCreatedEvents(payload, record.messageId);
    const executions = [];

    for (const s3Event of s3Events) {
      const correlationContext = createCorrelationContext(s3Event, record.messageAttributes);
      const stepFunctionInput = buildStepFunctionInput(s3Event, correlationContext);
      const logContext = {
        ...correlationContext,
        bucket: s3Event.bucketName,
        key: s3Event.objectKey
      };

      this.logger.info('Starting Step Function execution.', logContext);
      const claim = await this.idempotencyStore.claim(s3Event, stepFunctionInput);
      if (claim.duplicateCompleted) {
        this.logger.warn('Skipping duplicate S3 event already started.', logContext, {
          idempotencyKey: claim.idempotencyKey,
          existingStatus: claim.existingStatus
        });
        executions.push({
          input: stepFunctionInput,
          duplicate: true,
          idempotencyKey: claim.idempotencyKey
        });
        continue;
      }

      if (claim.inProgress) {
        throw new PearlError('S3 event is already being processed.', {
          code: 'S3_EVENT_IN_PROGRESS',
          retryable: true,
          details: {
            idempotencyKey: claim.idempotencyKey,
            existingStatus: claim.existingStatus
          }
        });
      }

      const execution = await this.startStepFunction(stepFunctionInput, s3Event, logContext, claim);
      await this.idempotencyStore.markStarted(claim, execution);
      this.logger.info('Started Step Function execution.', logContext, {
        executionArn: execution.executionArn,
        executionName: execution.executionName,
        duplicateNameRetried: execution.duplicateNameRetried,
        idempotencyKey: claim.idempotencyKey
      });

      executions.push({
        input: stepFunctionInput,
        execution
      });
    }

    return {
      ignored: false,
      executions
    };
  }

  async startStepFunction(stepFunctionInput, s3Event, logContext, claim) {
    try {
      return await this.stepFunctionService.startExecution(stepFunctionInput);
    } catch (error) {
      try {
        await this.idempotencyStore.release(claim, error);
      } catch (releaseError) {
        this.logger.error('Failed to release S3 idempotency claim.', logContext, releaseError, {
          idempotencyKey: claim.idempotencyKey,
          sourceMessageId: s3Event.sourceMessageId
        });
      }
      throw error;
    }
  }
}

module.exports = {
  SqsMessageProcessor
};
