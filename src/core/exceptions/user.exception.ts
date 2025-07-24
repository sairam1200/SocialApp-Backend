import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class UserAlreadyExistsException extends ConflictException {
  constructor(value: string, purpose: 'email' | 'username') {
    let message: string;
    message = `A user with the ${purpose} "${value}" already exists.`;
    super(message);
    this.name = 'UserAlreadyExistsException';
  }
}

export class UserAlreadyInRoleException extends ConflictException {
  constructor(email: string, id: string = '', roleName: string) {
    const message = email
      ? `The user with the email "${email}" is already assigned to the role "${roleName}".`
      : `The user with the ID "${id}" is already assigned to the role "${roleName}".`;
    super(message);
    this.name = 'UserAlreadyInRoleException';
  }
}

export class UserNotFoundException extends NotFoundException {
  constructor(value?: string, purpose?: 'email' | 'username') {

    if (!value) {
      super('User not found.');
    } else {

      let message: string;
      message = `A user with the ${purpose} "${value}" already exists.`;
      super(message);
    }

    this.name = 'UserAlreadyExistsException';
  }
} 