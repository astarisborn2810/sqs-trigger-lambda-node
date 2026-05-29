'use strict';

const {
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand
} = require('@aws-sdk/client-dynamodb');
const s3ObjectCreatedEvent = require('../fixtures/s3-object-created-event.json');
const { buildStepFunctionInput } = require('../../src/models/stepFunctionInput');
const { createCorrelationContext } = require('../../src/services/correlationService');
const {
  DynamoDbIdempotencyStore,
  NoOpIdempotencyStore,
  STATUS_STARTED,
  STATUS_STARTING
} = require('../../src/services/idempotencyStore');
const { parseObjectCreatedEvents } = require('../../src/services/s3EventParser');

function eventAndInput() {
  const [s3Event] = parseObjectCreatedEvents(s3ObjectCreatedEvent, 'message-1');
  const correlationContext = createCorrelationContext(s3Event, {});
  return {
    s3Event,
    input: buildStepFunctionInput(s3Event, correlationContext)
  };
}

function clientWithResponses(...responses) {
  return {
    send: jest.fn().mockImplementation(() => {
      const response = responses.shift();
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response);
    })
  };
}

describe('idempotencyStore', () => {
  test('NoOp store acquires without DynamoDB', async () => {
    const { s3Event, input } = eventAndInput();
    const store = new NoOpIdempotencyStore();

    const claim = await store.claim(s3Event, input);

    expect(claim).toMatchObject({
      acquired: true,
      idempotencyKey: expect.stringMatching(/^s3event#/)
    });
  });

  test('claims new S3 event with conditional PutItem and lease', async () => {
    const { s3Event, input } = eventAndInput();
    const client = clientWithResponses({});
    const store = new DynamoDbIdempotencyStore({
      client,
      tableName: 'idempotency-table',
      ttlDays: 91,
      inProgressTtlSeconds: 900
    });

    const claim = await store.claim(s3Event, input);

    expect(claim.acquired).toBe(true);
    expect(client.send).toHaveBeenCalledWith(expect.any(PutItemCommand));
    const commandInput = client.send.mock.calls[0][0].input;
    expect(commandInput.TableName).toBe('idempotency-table');
    expect(commandInput.ConditionExpression).toContain('attribute_not_exists');
    expect(commandInput.Item.status.S).toBe(STATUS_STARTING);
    expect(commandInput.Item.leaseExpiresAt.N).toBeDefined();
    expect(commandInput.Item.expiresAt.N).toBeDefined();
  });

  test('classifies STARTED record as duplicate completed', async () => {
    const { s3Event, input } = eventAndInput();
    const error = new Error('duplicate');
    error.name = 'ConditionalCheckFailedException';
    const client = clientWithResponses(error, {
      Item: {
        status: { S: STATUS_STARTED }
      }
    });
    const store = new DynamoDbIdempotencyStore({
      client,
      tableName: 'idempotency-table',
      ttlDays: 91,
      inProgressTtlSeconds: 900
    });

    const claim = await store.claim(s3Event, input);

    expect(client.send).toHaveBeenNthCalledWith(2, expect.any(GetItemCommand));
    expect(claim.duplicateCompleted).toBe(true);
    expect(claim.existingStatus).toBe(STATUS_STARTED);
  });

  test('classifies STARTING record as in progress', async () => {
    const { s3Event, input } = eventAndInput();
    const error = new Error('duplicate');
    error.name = 'ConditionalCheckFailedException';
    const client = clientWithResponses(error, {
      Item: {
        status: { S: STATUS_STARTING }
      }
    });
    const store = new DynamoDbIdempotencyStore({
      client,
      tableName: 'idempotency-table',
      ttlDays: 91,
      inProgressTtlSeconds: 900
    });

    const claim = await store.claim(s3Event, input);

    expect(claim.inProgress).toBe(true);
    expect(claim.existingStatus).toBe(STATUS_STARTING);
  });

  test('marks acquired claim as STARTED after Step Functions starts', async () => {
    const client = clientWithResponses({});
    const store = new DynamoDbIdempotencyStore({
      client,
      tableName: 'idempotency-table',
      ttlDays: 91,
      inProgressTtlSeconds: 900
    });
    const claim = {
      acquired: true,
      idempotencyKey: 's3event#abc'
    };

    await store.markStarted(claim, {
      executionName: 'execution-name',
      executionArn: 'execution-arn',
      duplicateNameRetried: false
    });

    expect(client.send).toHaveBeenCalledWith(expect.any(UpdateItemCommand));
    const commandInput = client.send.mock.calls[0][0].input;
    expect(commandInput.UpdateExpression).toContain('#status = :started');
    expect(commandInput.ExpressionAttributeValues[':started'].S).toBe(STATUS_STARTED);
    expect(commandInput.ExpressionAttributeValues[':executionArn'].S).toBe('execution-arn');
  });

  test('marks acquired claim as FAILED on release', async () => {
    const client = clientWithResponses({});
    const store = new DynamoDbIdempotencyStore({
      client,
      tableName: 'idempotency-table',
      ttlDays: 91,
      inProgressTtlSeconds: 900
    });

    await store.release({ acquired: true, idempotencyKey: 's3event#abc' }, new Error('boom'));

    expect(client.send).toHaveBeenCalledWith(expect.any(UpdateItemCommand));
    const commandInput = client.send.mock.calls[0][0].input;
    expect(commandInput.ExpressionAttributeValues[':failed'].S).toBe('FAILED');
    expect(commandInput.ExpressionAttributeValues[':failureMessage'].S).toBe('boom');
  });
});
