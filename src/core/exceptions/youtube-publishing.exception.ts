import { HttpStatus } from '@nestjs/common';
import ApplicationException from './application.exception';

export class YoutubeAuthError extends ApplicationException {
  constructor(message = 'YouTube authentication failed') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class YoutubeUploadError extends ApplicationException {
  constructor(message = 'YouTube upload failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class YoutubeAnalyticsError extends ApplicationException {
  constructor(message = 'YouTube analytics fetch failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class YoutubeRateLimitError extends ApplicationException {
  constructor(message = 'YouTube rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class YoutubeValidationError extends ApplicationException {
  constructor(message = 'YouTube request validation failed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}
