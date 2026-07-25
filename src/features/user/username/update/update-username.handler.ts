import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { HttpContext } from 'core/middlewares/httpContext.middleware';
import { generateTimestampUUID } from '../../../../core/utils/time.util';
import {
  ApplicationException,
  UserAlreadyExistsException,
} from 'core/exceptions';

export class UpdateUserNameCommand {
  userName: string;

  constructor(request: Partial<UpdateUserNameCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdateUserNameCommand)
export class UpdateUserNameCommandHandler implements ICommandHandler<
  UpdateUserNameCommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  async execute(command: UpdateUserNameCommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UnauthorizedException();
    }

    // Check if enough time has passed since last username change
    if (user.lastUserNameModifiedAt) {
      const cooldownDays = configs.user.profileChangeCooldownDays;
      const cooldownMilliseconds = cooldownDays * 24 * 60 * 60 * 1000;
      const timeSinceLastChange =
        Date.now() - new Date(user.lastUserNameModifiedAt).getTime();

      if (timeSinceLastChange < cooldownMilliseconds) {
        const daysRemaining = Math.ceil(
          (cooldownMilliseconds - timeSinceLastChange) / (24 * 60 * 60 * 1000),
        );
        throw new ApplicationException(
          `You cannot change your username yet. Please wait ${daysRemaining} more day(s) before requesting another username change.`,
        );
      }
    }

    user.userName = command.userName;
    user.normalizedUserName = command.userName.toUpperCase();
    user.lastUserNameModifiedAt = new Date();

    await this.userRepository.updateAsync(user);
  }
}
