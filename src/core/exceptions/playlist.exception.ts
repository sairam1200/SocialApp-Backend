import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";

export class PlaylistNotFoundException extends NotFoundException {
  constructor(referenceId?: string) {
    const message = referenceId
      ? `No playlist found with the reference ID "${referenceId}".`
      : "No playlist found";
    super(message);
    this.name = 'PlaylistNotFoundException';
  }
}

export class PlaylistAlreadyExistsException extends ConflictException {
  constructor(name: string, userName: string) {
    const message = `A playlist with the name "${name}" already exists for user "${userName}".`;
    super(message);
    this.name = 'PlaylistAlreadyExistsException';
  }
}

export class PlaylistUpdateNotAllowedException extends UnauthorizedException {
  constructor(referenceId: string) {
    const message = `Updating the playlist with reference ID "${referenceId}" is not allowed.`;
    super(message);
    this.name = 'PlaylistUpdateNotAllowedException';
  }
}

export class PlaylistMemberNotFoundException extends NotFoundException {
  constructor(referenceId: string, memberId: string) {
    const message = `No member found with ID "${memberId}" in the playlist with reference ID "${referenceId}".`;
    super(message);
    this.name = 'PlaylistMemberNotFoundException';
  }
}

export class PlaylistMemberAlreadyExistsException extends ConflictException {
  constructor(referenceId: string, userId: string) {
    const message = `User with ID "${userId}" is already a member in the playlist with reference ID "${referenceId}".`;
    super(message);
    this.name = 'PlaylistMemberAlreadyExistsException';
  }
}