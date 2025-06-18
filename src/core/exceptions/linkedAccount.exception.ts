import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class LinkedAccountAlreadyExistsException extends ConflictException {
  constructor(platform: string, email: string) {
    super(
      `Looks like your email (${email}) is already linked to a ${platform} account. Try logging in or choose a different account.`,
    );
    
    this.name = 'LinkedAccountAlreadyExistsException';
  }
}

export class LinkedAccountNotFoundException extends NotFoundException {
  constructor(name: string, id: string = '') {
    if (name) {
      super(`Linked account with name ${name} could not be found!`);
    } else {
      super(`Linked account with id ${id} could not be found!`);
    }

    this.name = 'LinkedAccountNotFoundException';
  }
}