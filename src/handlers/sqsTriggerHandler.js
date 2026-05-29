'use strict';

const { Logger } = require('../logging/logger');
const { SqsMessageProcessor } = require('../services/sqsMessageProcessor');

let defaultProcessor;
let defaultLogger;

function getDefaultProcessor() {
  if (!defaultProcessor) {
    defaultProcessor = new SqsMessageProcessor();
  }
  return defaultProcessor;
}

function getDefaultLogger() {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

function createHandler(processor = getDefaultProcessor(), logger = getDefaultLogger()) {
  return async function sqsTriggerHandler(event, context) {
    try {
      const result = await processor.process(event, context);
      logger.info('SQS trigger Lambda completed successfully.', {
        correlationId: null,
        batchId: null,
        vendorId: null,
        dataType: null
      });
      return result;
    } catch (error) {
      logger.error(
        'SQS trigger Lambda failed. Throwing so Lambda/SQS can retry retryable failures.',
        {
          correlationId: null,
          batchId: null,
          vendorId: null,
          dataType: null
        },
        error
      );
      throw error;
    }
  };
}

const handler = createHandler();

module.exports = {
  handler,
  createHandler
};
