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
    constructor(email?: string, id: string = '') {
        const message = email
            ? `No user found with the email "${email}".` :
            id ? `No user found with the ID "${id}".` : "No user found";
        super(message);
        this.name = 'UserNotFoundException';
    }
} 