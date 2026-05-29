'use strict';

const { createHash } = require('node:crypto');

const KEY_PREFIX = 's3event#';

function idempotencyKeyForEvent(s3Event) {
  const rawKey = [
    'v1',
    normalize(s3Event.bucketName),
    normalize(s3Event.objectKey),
    normalize(s3Event.eventType),
    eventIdentity(s3Event)
  ].join('|');

  return `${KEY_PREFIX}${sha256Hex(rawKey)}`;
}

function idempotencyKeyForInput(input) {
  if (input?.metadata?.idempotencyKey) {
    return input.metadata.idempotencyKey;
  }

  const rawKey = [
    'v1',
    normalize(input.bucket),
    normalize(input.key),
    normalize(input.eventType),
    eventIdentity({
      sequencer: input.sequencer,
      eTag: input.eTag,
      objectSize: input.objectSize,
      eventTime: input.eventTime,
      sourceMessageId: input.sourceMessageId
    })
  ].join('|');

  return `${KEY_PREFIX}${sha256Hex(rawKey)}`;
}

function shortHash(idempotencyKey, length = 20) {
  const normalized = idempotencyKey?.startsWith(KEY_PREFIX)
    ? idempotencyKey.slice(KEY_PREFIX.length)
    : sha256Hex(idempotencyKey || 'unknown');

  return normalized.slice(0, Math.min(length, normalized.length));
}

function eventIdentity(event) {
  const identity = [
    valueOrUnknown(event.sequencer),
    valueOrUnknown(event.eTag),
    valueOrUnknown(event.objectSize),
    valueOrUnknown(event.eventTime)
  ].join(':');

  return identity.replaceAll('unknown', '').replaceAll(':', '').trim()
    ? identity
    : valueOrUnknown(event.sourceMessageId);
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalize(value) {
  return value ? String(value).trim().toLowerCase() : 'unknown';
}

function valueOrUnknown(value) {
  return value === undefined || value === null || String(value).trim() === ''
    ? 'unknown'
    : String(value).trim();
}

module.exports = {
  idempotencyKeyForEvent,
  idempotencyKeyForInput,
  shortHash
};
