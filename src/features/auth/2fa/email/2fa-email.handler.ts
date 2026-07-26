import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  ApplicationException,
  UserNotFoundException,
} from '../../../../core/exceptions';
import { TwoFactorMethod } from '../../../../domain/enums';
import { IIdentityRepository } from '../../../../domain/repositories';
import { TwoFactorEmailService } from '../../../../infrastructure/services/social/two-factor-email.service';

export class SendTwoFactorEmailCodeCommand {}

/**
 * Send (or resend) the emailed sign-in code.
 *
 * Reachable both mid-login, with the short-lived 2FA token, and from settings
 * while enabling the method — the caller is identified the same way in both,
 * so there is one handler rather than two that drift.
 */
@CommandHandler(SendTwoFactorEmailCodeCommand)
export class SendTwoFactorEmailCodeCommandHandler implements ICommandHandler<
  SendTwoFactorEmailCodeCommand,
  { sent: boolean; cooldown: boolean }
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    private readonly twoFactorEmail: TwoFactorEmailService,
  ) {}

  public async execute(): Promise<{ sent: boolean; cooldown: boolean }> {
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) throw new UserNotFoundException();

    const result = await this.twoFactorEmail.issueAsync(user);
    if (!result.sent && result.reason === 'unavailable') {
      throw new ApplicationException(
        'We could not send a code right now. Try again in a moment.',
      );
    }
    return { sent: result.sent, cooldown: result.reason === 'cooldown' };
  }
}

export class EnableTwoFactorEmailRequestModel {
  @ApiProperty({ description: 'The six-digit code from the email' })
  code: string;
}

export class EnableTwoFactorEmailCommand {
  model: EnableTwoFactorEmailRequestModel;

  constructor(request: Partial<EnableTwoFactorEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

const enableValidations = Joi.object({
  code: Joi.string().trim().length(6).required().messages({
    'string.length': 'The code is six digits.',
  }),
});

/**
 * Turn on the email second factor.
 *
 * Requires proving receipt of a code first — enabling a factor you cannot
 * actually receive locks the account out, and that is not a theoretical risk
 * for a mistyped or bounced address.
 */
@CommandHandler(EnableTwoFactorEmailCommand)
export class EnableTwoFactorEmailCommandHandler implements ICommandHandler<
  EnableTwoFactorEmailCommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    private readonly twoFactorEmail: TwoFactorEmailService,
  ) {}

  public async execute(command: EnableTwoFactorEmailCommand): Promise<void> {
    await enableValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) throw new UserNotFoundException();

    const result = await this.twoFactorEmail.verifyAsync(
      user.id,
      command.model.code,
    );
    if (!result.valid) {
      throw new ApplicationException(
        result.reason === 'exhausted'
          ? 'Too many attempts. Request a new code.'
          : 'That code is not valid, or it has expired. Request a new one.',
      );
    }

    user.twoFactorEnabled = true;
    user.twoFactorMethod = TwoFactorMethod.Email;
    // The TOTP secret is cleared when switching to email so a stale
    // authenticator entry cannot still satisfy the second factor.
    user.twoFactorSecret = null;
    await this.userRepository.updateAsync(user);
  }
}
