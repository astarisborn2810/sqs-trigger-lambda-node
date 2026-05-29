'use strict';

const { Logger } = require('../logging/logger');
const { buildStepFunctionInput } = require('../models/stepFunctionInput');
const { validateSqsEvent, validateSqsRecord } = require('../validators/messageValidator');
const { createCorrelationContext } = require('./correlationService');
const { isS3TestEvent, parseObjectCreatedEvents, parseSqsBody } = require('./s3EventParser');
const { StepFunctionService } = require('./stepFunctionService');

class SqsMessageProcessor {
  constructor(options = {}) {
    this.stepFunctionService = options.stepFunctionService || new StepFunctionService(options);
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
      const execution = await this.stepFunctionService.startExecution(stepFunctionInput);
      this.logger.info('Started Step Function execution.', logContext, {
        executionArn: execution.executionArn,
        executionName: execution.executionName,
        duplicateNameRetried: execution.duplicateNameRetried
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
}

module.exports = {
  SqsMessageProcessor
};
