'use strict';

const { Logger } = require('../../src/logging/logger');

describe('Logger', () => {
  test('emits structured JSON logs with required fields', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger({ serviceName: 'test-service', logLevel: 'INFO' });

    logger.info('Started Step Function execution.', {
      correlationId: 'corr-001',
      batchId: 'batch-20260529',
      vendorId: 'prismhr',
      dataType: 'financial',
      bucket: 'pearl-outbound-dev',
      key: 'outbound/prismhr/financial/file.json'
    });

    const logEntry = JSON.parse(spy.mock.calls[0][0]);
    expect(logEntry).toMatchObject({
      level: 'INFO',
      service: 'test-service',
      correlationId: 'corr-001',
      batchId: 'batch-20260529',
      vendorId: 'prismhr',
      dataType: 'financial',
      bucket: 'pearl-outbound-dev',
      key: 'outbound/prismhr/financial/file.json',
      message: 'Started Step Function execution.'
    });
    expect(logEntry.timestamp).toBeDefined();

    spy.mockRestore();
  });
});
