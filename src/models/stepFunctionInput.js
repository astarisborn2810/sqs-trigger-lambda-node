'use strict';

function buildStepFunctionInput(s3Event, correlationContext) {
  const fileName = fileNameFromKey(s3Event.objectKey);

  return {
    correlationId: correlationContext.correlationId,
    batchId: correlationContext.batchId,
    vendorId: correlationContext.vendorId,
    dataType: correlationContext.dataType,
    payloadType: correlationContext.dataType,
    fileName,
    s3PathOrArn: `s3://${s3Event.bucketName}/${s3Event.objectKey}`,
    bucket: s3Event.bucketName,
    key: s3Event.objectKey,
    eventType: s3Event.eventType,
    eventTime: s3Event.eventTime,
    awsRegion: s3Event.awsRegion,
    objectSize: s3Event.objectSize,
    eTag: s3Event.eTag,
    sequencer: s3Event.sequencer,
    sourceMessageId: s3Event.sourceMessageId,
    metadata: {
      source: 's3-event-notification',
      trigger: 'sqs-trigger-lambda-node'
    }
  };
}

function fileNameFromKey(objectKey) {
  const normalized = String(objectKey || '').replace(/\\/g, '/');
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  const extensionIndex = lastSegment.lastIndexOf('.');
  return extensionIndex > 0 ? lastSegment.slice(0, extensionIndex) : lastSegment;
}

module.exports = {
  buildStepFunctionInput,
  fileNameFromKey
};
