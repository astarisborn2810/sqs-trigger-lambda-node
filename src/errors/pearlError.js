'use strict';

class PearlError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PearlError';
    this.code = options.code || 'PEARL_ERROR';
    this.retryable = options.retryable !== false;
    this.statusCode = options.statusCode || 500;
    this.details = options.details || {};
    Error.captureStackTrace?.(this, PearlError);
  }
}

module.exports = {
  PearlError
};
