import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { UserNotFoundException } from '../../../../core/exceptions';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { TwoFactorMethod } from '../../../../domain/enums';
import { TwoFactorEmailService } from '../../../../infrastructure/services/social/two-factor-email.service';

export class Disable2FACommand {}

@CommandHandler(Disable2FACommand)
export class Disbale2FACommandHandler implements ICommandHandler<
  Disable2FACommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    private readonly twoFactorEmail: TwoFactorEmailService,
  ) {}

  public async execute(command: Disable2FACommand): Promise<void> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    // Back to the default method, so re-enabling starts from a clean state
    // rather than silently resuming whatever was configured before.
    user.twoFactorMethod = TwoFactorMethod.Totp;

    await this.userRepository.updateAsync(user);
    // Any outstanding emailed code is now meaningless. Leaving it live would
    // let a code issued before the switch still satisfy a later challenge.
    await this.twoFactorEmail.clearAsync(user.id);
  }
}
