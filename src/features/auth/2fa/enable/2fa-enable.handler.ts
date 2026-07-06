import * as Joi from 'joi';
import * as speakeasy from 'speakeasy';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserRepository } from '../../../../domain/repositories';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  ApplicationException,
  UserNotFoundException,
} from '../../../../core/exceptions';

export class Enable2FAModel {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  userOTP: string;
}

export class Enable2FACommand {
  model: Enable2FAModel;

  constructor(request: Partial<Enable2FACommand> = {}) {
    Object.assign(this, request);
  }
}

const enable2FAValidations = Joi.object({
  secret: Joi.string().required(),
  userOTP: Joi.string().required(),
});

@CommandHandler(Enable2FACommand)
export class Enable2FACommandHandler
  implements ICommandHandler<Enable2FACommand, void>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(command: Enable2FACommand): Promise<void> {
    const { model } = command;
    await enable2FAValidations.validateAsync(model);

    const valid = this.verifyTwoFAOTP(model.userOTP, model.secret);
    if (!valid) {
      throw new ApplicationException('Invalid OTP or secret.');
    }

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.twoFactorEnabled) {
      throw new ApplicationException(''); // AI fix error
    }

    user.twoFactorEnabled = true;
    user.twoFactorSecret = model.secret;
    await this.userRepository.updateAsync(user);
  }

  private verifyTwoFAOTP(userOTP: string, secret: string): boolean {
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: userOTP,
      window: 1,
    });

    return verified;
  }
}
