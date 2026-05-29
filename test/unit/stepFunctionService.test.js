'use strict';

const { StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { StepFunctionService, buildExecutionName } = require('../../src/services/stepFunctionService');

const input = {
  correlationId: 'corr-001-abcdef',
  batchId: 'batch-20260529',
  vendorId: 'prismhr',
  dataType: 'financial',
  payloadType: 'financial',
  fileName: 'batch-20260529_prismhr_PEARL-401K-PLAN-001',
  s3PathOrArn: 's3://pearl-outbound-dev/outbound/prismhr/financial/file.json'
};

describe('StepFunctionService', () => {
  test('builds execution name from vendor, data type, batch, and correlation short id', () => {
    expect(buildExecutionName(input)).toBe('prismhr-financial-batch-20260529-corr-001-abc');
  });

  test('fails when STATE_MACHINE_ARN is missing', async () => {
    const service = new StepFunctionService({
      stateMachineArn: '',
      client: {
        send: jest.fn()
      }
    });

    await expect(service.startExecution(input)).rejects.toMatchObject({
      code: 'MISSING_STATE_MACHINE_ARN'
    });
  });

  test('uses StartExecutionCommand', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({
        executionArn: 'execution-arn',
        startDate: new Date('2026-05-29T10:00:00Z')
      })
    };
    const service = new StepFunctionService({
      stateMachineArn: 'arn:aws:states:us-east-1:123456789012:stateMachine:test',
      client
    });

    const result = await service.startExecution(input);

    expect(client.send).toHaveBeenCalledWith(expect.any(StartExecutionCommand));
    expect(result).toMatchObject({
      executionArn: 'execution-arn',
      executionName: 'prismhr-financial-batch-20260529-corr-001-abc',
      duplicateNameRetried: false
    });
  });
});
