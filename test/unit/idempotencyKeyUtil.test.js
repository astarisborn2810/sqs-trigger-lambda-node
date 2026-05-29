'use strict';

const s3ObjectCreatedEvent = require('../fixtures/s3-object-created-event.json');
const { buildStepFunctionInput } = require('../../src/models/stepFunctionInput');
const { createCorrelationContext } = require('../../src/services/correlationService');
const {
  idempotencyKeyForEvent,
  idempotencyKeyForInput,
  shortHash
} = require('../../src/services/idempotencyKeyUtil');
const { parseObjectCreatedEvents } = require('../../src/services/s3EventParser');

describe('idempotencyKeyUtil', () => {
  test('creates stable S3 event idempotency key', () => {
    const [s3Event] = parseObjectCreatedEvents(s3ObjectCreatedEvent, 'message-1');

    expect(idempotencyKeyForEvent(s3Event)).toBe(idempotencyKeyForEvent(s3Event));
    expect(idempotencyKeyForEvent(s3Event)).toMatch(/^s3event#[a-f0-9]{64}$/);
  });

  test('uses Step Function input metadata idempotency key when present', () => {
    const [s3Event] = parseObjectCreatedEvents(s3ObjectCreatedEvent, 'message-1');
    const input = buildStepFunctionInput(s3Event, createCorrelationContext(s3Event, {}));

    expect(idempotencyKeyForInput(input)).toBe(input.metadata.idempotencyKey);
  });

  test('creates short hash for deterministic execution support', () => {
    expect(shortHash('s3event#1234567890abcdef', 8)).toBe('12345678');
  });
});
