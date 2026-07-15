import { HttpStatus } from '@nestjs/common';
import ApplicationException from './application.exception';

export class PublishAuthError extends ApplicationException {
  constructor(message = 'Publishing authentication failed') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class PublishRateLimitError extends ApplicationException {
  constructor(message = 'Publishing rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class PublishValidationError extends ApplicationException {
  constructor(message = 'Publishing validation failed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class PublishUploadError extends ApplicationException {
  constructor(message = 'Publishing upload failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class PublishExpiredError extends ApplicationException {
  constructor(
    message = 'This upload has expired after 24 hours. Please upload the media again.',
  ) {
    super(message, HttpStatus.GONE);
  }
}

export class PublishInfrastructureError extends ApplicationException {
  constructor(message = 'Publishing infrastructure unavailable') {
    super(message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
