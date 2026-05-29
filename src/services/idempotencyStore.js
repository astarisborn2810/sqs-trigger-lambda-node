'use strict';

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand
} = require('@aws-sdk/client-dynamodb');
const { getAppConfig } = require('../config/appConfig');
const { PearlError } = require('../errors/pearlError');
const { idempotencyKeyForInput } = require('./idempotencyKeyUtil');

const STATUS_STARTING = 'STARTING';
const STATUS_STARTED = 'STARTED';
const STATUS_FAILED = 'FAILED';

const DECISION_ACQUIRED = 'ACQUIRED';
const DECISION_DUPLICATE_COMPLETED = 'DUPLICATE_COMPLETED';
const DECISION_IN_PROGRESS = 'IN_PROGRESS';

class NoOpIdempotencyStore {
  async claim(_s3Event, input) {
    return idempotencyClaim(DECISION_ACQUIRED, idempotencyKeyForInput(input));
  }

  async markStarted() {
    return undefined;
  }

  async release() {
    return undefined;
  }
}

class DynamoDbIdempotencyStore {
  constructor(options = {}) {
    const config = options.config || getAppConfig();
    this.tableName = options.tableName || config.idempotencyTableName;
    this.ttlDays = options.ttlDays || config.idempotencyTtlDays;
    this.inProgressTtlSeconds =
      options.inProgressTtlSeconds || config.idempotencyInProgressTtlSeconds;
    this.client =
      options.client ||
      new DynamoDBClient({
        region: config.awsRegion
      });
  }

  async claim(s3Event, input) {
    const idempotencyKey = idempotencyKeyForInput(input);
    const now = epochSeconds();
    const leaseExpiresAt = now + this.inProgressTtlSeconds;

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: itemFor(s3Event, input, idempotencyKey, now, leaseExpiresAt, this.ttlDays),
          ConditionExpression:
            'attribute_not_exists(#idempotencyKey) OR #status = :failed OR (#status = :starting AND #leaseExpiresAt < :now)',
          ExpressionAttributeNames: {
            '#idempotencyKey': 'idempotencyKey',
            '#status': 'status',
            '#leaseExpiresAt': 'leaseExpiresAt'
          },
          ExpressionAttributeValues: {
            ':failed': s(STATUS_FAILED),
            ':starting': s(STATUS_STARTING),
            ':now': n(now)
          }
        })
      );

      return idempotencyClaim(DECISION_ACQUIRED, idempotencyKey);
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return this.existingClaim(idempotencyKey);
      }
      throw new PearlError('Unable to claim S3 idempotency record.', {
        code: 'IDEMPOTENCY_CLAIM_FAILED',
        retryable: true,
        details: { cause: error.message }
      });
    }
  }

  async existingClaim(idempotencyKey) {
    try {
      const response = await this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: key(idempotencyKey),
          ConsistentRead: true
        })
      );
      const existingStatus = response.Item?.status?.S || null;
      if (existingStatus === STATUS_STARTED) {
        return idempotencyClaim(DECISION_DUPLICATE_COMPLETED, idempotencyKey, existingStatus);
      }
      return idempotencyClaim(DECISION_IN_PROGRESS, idempotencyKey, existingStatus);
    } catch (error) {
      throw new PearlError('Unable to read existing S3 idempotency record.', {
        code: 'IDEMPOTENCY_READ_FAILED',
        retryable: true,
        details: { cause: error.message }
      });
    }
  }

  async markStarted(claim, execution) {
    if (!claim?.acquired) {
      return;
    }

    const now = epochSeconds();
    const expressionAttributeNames = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
      '#executionName': 'executionName',
      '#executionArn': 'executionArn',
      '#duplicateNameRetried': 'duplicateNameRetried',
      '#failureMessage': 'failureMessage',
      '#leaseExpiresAt': 'leaseExpiresAt'
    };
    const expressionAttributeValues = {
      ':started': s(STATUS_STARTED),
      ':updatedAt': n(now),
      ':executionName': s(execution.executionName),
      ':duplicateNameRetried': bool(Boolean(execution.duplicateNameRetried))
    };
    let updateExpression =
      'SET #status = :started, #updatedAt = :updatedAt, #executionName = :executionName, #duplicateNameRetried = :duplicateNameRetried';

    if (execution.executionArn) {
      updateExpression += ', #executionArn = :executionArn';
      expressionAttributeValues[':executionArn'] = s(execution.executionArn);
    }
    updateExpression += ' REMOVE #failureMessage, #leaseExpiresAt';

    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: key(claim.idempotencyKey),
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      throw new PearlError('Unable to mark S3 idempotency record as started.', {
        code: 'IDEMPOTENCY_MARK_STARTED_FAILED',
        retryable: true,
        details: { cause: error.message }
      });
    }
  }

  async release(claim, cause) {
    if (!claim?.acquired) {
      return;
    }

    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: key(claim.idempotencyKey),
          UpdateExpression:
            'SET #status = :failed, #updatedAt = :updatedAt, #failureMessage = :failureMessage REMOVE #leaseExpiresAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#failureMessage': 'failureMessage',
            '#leaseExpiresAt': 'leaseExpiresAt'
          },
          ExpressionAttributeValues: {
            ':failed': s(STATUS_FAILED),
            ':updatedAt': n(epochSeconds()),
            ':failureMessage': s(failureMessage(cause))
          }
        })
      );
    } catch (error) {
      throw new PearlError('Unable to release S3 idempotency claim.', {
        code: 'IDEMPOTENCY_RELEASE_FAILED',
        retryable: true,
        details: { cause: error.message }
      });
    }
  }
}

function createIdempotencyStore(options = {}) {
  const config = options.config || getAppConfig();
  if (!config.idempotencyTableName && !options.tableName) {
    return new NoOpIdempotencyStore();
  }
  return new DynamoDbIdempotencyStore(options);
}

function idempotencyClaim(decision, idempotencyKey, existingStatus = null) {
  return {
    idempotencyKey,
    decision,
    existingStatus,
    acquired: decision === DECISION_ACQUIRED,
    duplicateCompleted: decision === DECISION_DUPLICATE_COMPLETED,
    inProgress: decision === DECISION_IN_PROGRESS
  };
}

function itemFor(s3Event, input, idempotencyKey, now, leaseExpiresAt, ttlDays) {
  const item = {
    idempotencyKey: s(idempotencyKey),
    status: s(STATUS_STARTING),
    createdAt: n(now),
    updatedAt: n(now),
    leaseExpiresAt: n(leaseExpiresAt),
    expiresAt: n(now + ttlDays * 24 * 60 * 60)
  };

  putIfPresent(item, 'bucket', s3Event.bucketName);
  putIfPresent(item, 'objectKey', s3Event.objectKey);
  putIfPresent(item, 'eventType', s3Event.eventType);
  putIfPresent(item, 'eTag', s3Event.eTag);
  putIfPresent(item, 'sequencer', s3Event.sequencer);
  putIfPresent(item, 'sourceMessageId', s3Event.sourceMessageId);
  putIfPresent(item, 'fileName', input.fileName);
  putIfPresent(item, 's3PathOrArn', input.s3PathOrArn);
  putIfPresent(item, 'correlationId', input.correlationId);
  putIfPresent(item, 'batchId', input.batchId);
  putIfPresent(item, 'vendorId', input.vendorId);
  putIfPresent(item, 'dataType', input.dataType);

  return item;
}

function isConditionalCheckFailed(error) {
  return error?.name === 'ConditionalCheckFailedException';
}

function key(idempotencyKey) {
  return {
    idempotencyKey: s(idempotencyKey)
  };
}

function putIfPresent(item, field, value) {
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    item[field] = s(value);
  }
}

function s(value) {
  return { S: String(value) };
}

function n(value) {
  return { N: String(value) };
}

function bool(value) {
  return { BOOL: Boolean(value) };
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function failureMessage(cause) {
  const message = cause?.message || cause?.name || 'unknown';
  return String(message).slice(0, 512);
}

module.exports = {
  DynamoDbIdempotencyStore,
  NoOpIdempotencyStore,
  createIdempotencyStore,
  idempotencyClaim,
  STATUS_STARTING,
  STATUS_STARTED,
  STATUS_FAILED,
  DECISION_ACQUIRED,
  DECISION_DUPLICATE_COMPLETED,
  DECISION_IN_PROGRESS
};
