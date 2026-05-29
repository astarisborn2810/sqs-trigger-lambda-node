'use strict';

const { getAppConfig } = require('../config/appConfig');

const LEVEL_PRIORITY = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

class Logger {
  constructor(config = getAppConfig()) {
    this.serviceName = config.serviceName;
    this.minimumLevel = config.logLevel || 'INFO';
  }

  debug(message, context = {}, extra = {}) {
    this.write('DEBUG', message, context, extra);
  }

  info(message, context = {}, extra = {}) {
    this.write('INFO', message, context, extra);
  }

  warn(message, context = {}, extra = {}) {
    this.write('WARN', message, context, extra);
  }

  error(message, context = {}, error = undefined, extra = {}) {
    const errorFields = error
      ? {
          errorName: error.name,
          errorCode: error.code,
          errorMessage: error.message,
          retryable: error.retryable
        }
      : {};
    this.write('ERROR', message, context, { ...extra, ...errorFields });
  }

  write(level, message, context = {}, extra = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      correlationId: context.correlationId || null,
      batchId: context.batchId || null,
      vendorId: context.vendorId || null,
      dataType: context.dataType || null,
      bucket: context.bucket || context.bucketName || null,
      key: context.key || context.objectKey || null,
      message,
      ...extra
    };

    const serialized = JSON.stringify(logEntry);
    if (level === 'ERROR') {
      console.error(serialized);
    } else if (level === 'WARN') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  shouldLog(level) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minimumLevel];
  }
}

module.exports = {
  Logger
};
