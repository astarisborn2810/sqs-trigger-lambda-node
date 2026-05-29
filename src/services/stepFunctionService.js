'use strict';

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { getAppConfig } = require('../config/appConfig');
const { validateStateMachineArn } = require('../validators/messageValidator');
const { sanitize } = require('./correlationService');

class StepFunctionService {
  constructor(options = {}) {
    const config = options.config || getAppConfig();
    this.stateMachineArn = options.stateMachineArn || config.stateMachineArn;
    this.client =
      options.client ||
      new SFNClient({
        region: config.awsRegion
      });
  }

  async startExecution(input) {
    validateStateMachineArn(this.stateMachineArn);

    const baseExecutionName = buildExecutionName(input);
    try {
      return await this.startWithName(baseExecutionName, input);
    } catch (error) {
      if (isDuplicateExecutionName(error)) {
        const timestampedExecutionName = trimExecutionName(`${baseExecutionName}-${Date.now()}`);
        return this.startWithName(timestampedExecutionName, input, true);
      }
      throw error;
    }
  }

  async startWithName(executionName, input, duplicateNameRetried = false) {
    const command = new StartExecutionCommand({
      stateMachineArn: this.stateMachineArn,
      name: executionName,
      input: JSON.stringify(input)
    });

    const response = await this.client.send(command);
    return {
      executionArn: response.executionArn,
      startDate: response.startDate,
      executionName,
      duplicateNameRetried
    };
  }
}

function buildExecutionName(input) {
  const correlationIdShort = sanitize(input.correlationId).slice(0, 12);
  return trimExecutionName(
    [
      sanitize(input.vendorId || 'unknown-vendor'),
      sanitize(input.dataType || 'unknown'),
      sanitize(input.batchId || 'unknown-batch'),
      correlationIdShort || 'correlation'
    ].join('-')
  );
}

function trimExecutionName(executionName) {
  return executionName.slice(0, 80).replace(/-+$/g, '');
}

function isDuplicateExecutionName(error) {
  return (
    error?.name === 'ExecutionAlreadyExists' ||
    error?.name === 'ExecutionAlreadyExistsException' ||
    error?.Code === 'ExecutionAlreadyExists'
  );
}

module.exports = {
  StepFunctionService,
  buildExecutionName,
  isDuplicateExecutionName
};
