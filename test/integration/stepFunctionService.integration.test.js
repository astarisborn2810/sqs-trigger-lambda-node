'use strict';

const { StepFunctionService } = require('../../src/services/stepFunctionService');

const input = {
  correlationId: 'corr-001-abcdef',
  batchId: 'batch-20260529',
  vendorId: 'prismhr',
  dataType: 'financial',
  payloadType: 'financial',
  fileName: 'batch-20260529_prismhr_PEARL-401K-PLAN-001',
  s3PathOrArn: 's3://pearl-outbound-dev/outbound/prismhr/financial/file.json'
};

describe('StepFunctionService integration with AWS SDK v3 client contract', () => {
  test('retries with timestamp when Step Functions reports duplicate execution name', async () => {
    const duplicateError = new Error('Execution already exists');
    duplicateError.name = 'ExecutionAlreadyExists';
    const client = {
      send: jest
        .fn()
        .mockRejectedValueOnce(duplicateError)
        .mockResolvedValueOnce({ executionArn: 'execution-arn' })
    };
    const service = new StepFunctionService({
      stateMachineArn: 'arn:aws:states:us-east-1:123456789012:stateMachine:test',
      client
    });

    const result = await service.startExecution(input);

    expect(client.send).toHaveBeenCalledTimes(2);
    expect(result.duplicateNameRetried).toBe(true);
    expect(result.executionName).toMatch(/^prismhr-financial-batch-20260529-corr-001-abc-\d+/);
  });
});
