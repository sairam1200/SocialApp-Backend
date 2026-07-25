import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  BadRequestException,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';

export class UpdatePhoneNumberCommand {
  phoneNumber: string;

  constructor(request: Partial<UpdatePhoneNumberCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdatePhoneNumberCommand)
export class UpdatePhoneNumberCommandHandler implements ICommandHandler<
  UpdatePhoneNumberCommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  async execute(command: UpdatePhoneNumberCommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UnauthorizedException();
    }

    // Check if enough time has passed since last phone number change
    if (user.lastPhoneNumberModifiedAt) {
      const cooldownDays = configs.user.profileChangeCooldownDays;
      const cooldownMilliseconds = cooldownDays * 24 * 60 * 60 * 1000;
      const timeSinceLastChange =
        Date.now() - new Date(user.lastPhoneNumberModifiedAt).getTime();

      if (timeSinceLastChange < cooldownMilliseconds) {
        const daysRemaining = Math.ceil(
          (cooldownMilliseconds - timeSinceLastChange) / (24 * 60 * 60 * 1000),
        );
        throw new BadRequestException(
          `You cannot change your phone number yet. Please wait ${daysRemaining} more day(s) before requesting another phone number change.`,
        );
      }
    }

    user.newPhoneNumber = command.phoneNumber;
    user.lastPhoneNumberModifiedAt = new Date();

    await this.userRepository.updateAsync(user);

    // TODO: Generate token and send SMS/email confirmation
  }
}
