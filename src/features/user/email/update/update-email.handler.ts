import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { UserAlreadyExistsException } from 'core/exceptions';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserRepository } from '../../../../domain/repositories';
import { HttpContext } from 'core/middlewares/httpContext.middleware';
import {
  BadRequestException,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';

export class UpdateEmailCommand {
  email: string;

  constructor(request: Partial<UpdateEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdateEmailCommand)
export class UpdateEmailCommandHandler
  implements ICommandHandler<UpdateEmailCommand, void>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: UpdateEmailCommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UnauthorizedException();
    }

    // Check if enough time has passed since last email change
    if (user.lastEmailModifiedAt) {
      const cooldownDays = configs.user.profileChangeCooldownDays;
      const cooldownMilliseconds = cooldownDays * 24 * 60 * 60 * 1000;
      const timeSinceLastChange =
        Date.now() - new Date(user.lastEmailModifiedAt).getTime();

      if (timeSinceLastChange < cooldownMilliseconds) {
        const daysRemaining = Math.ceil(
          (cooldownMilliseconds - timeSinceLastChange) / (24 * 60 * 60 * 1000),
        );
        throw new BadRequestException(
          `You cannot change your email yet. Please wait ${daysRemaining} more day(s) before requesting another email change.`,
        );
      }
    }

    const isEmailInuse = await this.userRepository.isEmailInuseAsync(
      command.email,
    );
    if (isEmailInuse) {
      throw new UserAlreadyExistsException(command.email, 'email');
    }

    user.newEmail = command.email;
    user.lastEmailModifiedAt = new Date();

    await this.userRepository.updateAsync(user);
  }
}
