import { BadRequestException } from '@nestjs/common';

export class InvalidEmailDomainException extends BadRequestException {
  readonly clientMessage =
    'Invalid email address. Please check your email and try again.';

  constructor(domain: string) {
    super(`Email domain "${domain}" does not exist or cannot receive email.`);
    this.name = 'InvalidEmailDomainException';
  }
}

export class EmailDomainSuggestionException extends BadRequestException {
  readonly clientMessage: string;

  constructor(suggestion: string) {
    super(`Did you mean ${suggestion}?`);
    this.clientMessage = `Did you mean ${suggestion}?`;
    this.name = 'EmailDomainSuggestionException';
  }
}
