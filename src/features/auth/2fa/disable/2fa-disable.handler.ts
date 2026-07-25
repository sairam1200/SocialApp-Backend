import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { UserNotFoundException } from '../../../../core/exceptions';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';

export class Disable2FACommand {}

@CommandHandler(Disable2FACommand)
export class Disbale2FACommandHandler implements ICommandHandler<
  Disable2FACommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
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

    await this.userRepository.updateAsync(user);
  }
}
