import { ConflictException, NotFoundException } from "@nestjs/common";

export class ClaimAlreadyExistsException extends ConflictException {
  constructor(claimType: string) {
    const message = `The claim of type '${claimType}' already exists for this user.`;
    super(message);
    this.name = 'ClaimAlreadyExistsException';
  }
}

export class ClaimNotFoundException extends NotFoundException {
  constructor() {
    const message = `The claim was not found for the user.`;
    super(message);
    this.name = 'ClaimNotFoundException';
  }
}