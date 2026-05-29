'use strict';

const { randomUUID } = require('node:crypto');

function createCorrelationContext(s3Event, messageAttributes = {}) {
  const objectKey = s3Event.objectKey || '';
  const correlationId = attribute(messageAttributes, 'correlationId') || randomUUID();

  return {
    correlationId,
    correlationIdShort: sanitize(correlationId).slice(0, 12),
    batchId: attribute(messageAttributes, 'batchId') || inferBatchId(objectKey),
    vendorId: attribute(messageAttributes, 'vendorId') || inferVendorId(objectKey),
    dataType: attribute(messageAttributes, 'dataType') || inferDataType(objectKey),
    bucket: s3Event.bucketName,
    key: s3Event.objectKey
  };
}

function attribute(attributes, name) {
  if (!attributes) {
    return undefined;
  }

  const exact = attributes[name]?.stringValue || attributes[name]?.StringValue;
  if (exact) {
    return exact;
  }

  const lowerName = name.toLowerCase();
  const match = Object.entries(attributes).find(([key]) => key.toLowerCase() === lowerName);
  return match?.[1]?.stringValue || match?.[1]?.StringValue;
}

function inferDataType(objectKey) {
  const normalized = `/${objectKey.toLowerCase()}/`;
  if (normalized.includes('/financial/')) {
    return 'financial';
  }
  if (normalized.includes('/indicative/')) {
    return 'indicative';
  }
  return 'unknown';
}

function inferVendorId(objectKey) {
  const segments = objectKey.split('/').filter(Boolean);
  if (segments[0] === 'outbound' && segments[1]) {
    return sanitize(segments[1]);
  }
  return 'unknown-vendor';
}

function inferBatchId(objectKey) {
  const segments = objectKey.split('/').filter(Boolean);
  const batchSegment = segments.find((segment) => looksLikeBatch(segment));
  return batchSegment ? sanitize(batchSegment) : 'unknown-batch';
}

function looksLikeBatch(value) {
  const normalized = value.toLowerCase();
  return normalized.startsWith('batch') || /\d{8,}/.test(normalized);
}

function sanitize(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = {
  createCorrelationContext,
  inferDataType,
  inferVendorId,
  inferBatchId,
  sanitize
};
