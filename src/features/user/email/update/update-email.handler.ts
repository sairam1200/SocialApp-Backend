import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { User } from '../../../../domain/entities';
import { UserAlreadyExistsException } from 'core/exceptions';
import { stringUtil } from '../../../../core/utils/string.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { HttpContext } from 'core/middlewares/httpContext.middleware';
import {
  BadRequestException,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { VerificationEmailService } from '../../../../infrastructure/services/verification-email.service';
import { IEmailValidationService } from '../../../../domain/services/iemail-validation.service';
import {
  InvalidEmailDomainException,
  EmailDomainSuggestionException,
} from '../../../../core/exceptions/email.exception';

const UNVERIFIED_EMAIL_CHANGE_COOLDOWN_MS = 2 * 60 * 1000;

export class UpdateEmailCommand {
  email: string;
  userAgent: string;
  ipAddress: string;

  constructor(request: Partial<UpdateEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UpdateEmailCommand)
export class UpdateEmailCommandHandler
  implements ICommandHandler<UpdateEmailCommand, void>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IEMAIL_VALIDATION_SERVICE)
    private readonly emailValidationService: IEmailValidationService,
    private readonly verificationEmailService: VerificationEmailService,
  ) {}

  async execute(command: UpdateEmailCommand): Promise<void> {
    command.email = stringUtil.normalizeEmail(command.email);
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.emailConfirmed) {
      return this.handleUnverifiedEmailChange(user, command);
    }

    return this.handleVerifiedEmailChange(user, command);
  }

  private async handleUnverifiedEmailChange(
    user: User,
    command: UpdateEmailCommand,
  ): Promise<void> {
    if (user.lastEmailModifiedAt) {
      const timeSinceLastChange =
        Date.now() - new Date(user.lastEmailModifiedAt).getTime();
      if (timeSinceLastChange < UNVERIFIED_EMAIL_CHANGE_COOLDOWN_MS) {
        const secondsRemaining = Math.ceil(
          (UNVERIFIED_EMAIL_CHANGE_COOLDOWN_MS - timeSinceLastChange) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${secondsRemaining} second(s) before requesting another email change.`,
        );
      }
    }

    const isEmailInuse = await this.userRepository.isEmailInuseAsync(
      command.email,
    );
    if (isEmailInuse) {
      throw new UserAlreadyExistsException(command.email, 'email');
    }

    const emailValidation = await this.emailValidationService.validate(
      command.email,
    );
    if (!emailValidation.valid) {
      if (emailValidation.suggestion) {
        throw new EmailDomainSuggestionException(emailValidation.suggestion);
      }
      throw new InvalidEmailDomainException(command.email.split('@')[1]);
    }

    logger.info(
      `[UpdateEmail] CHECKPOINT 1: Handler received targetEmail=${command.email} for userId=${user.id} (isEmailChange=true, deliveryMode=async)`,
    );

    await this.verificationEmailService.sendVerificationEmail({
      user,
      targetEmail: command.email,
      userAgent: command.userAgent,
      ipAddress: command.ipAddress,
      isEmailChange: true,
      updateUser: true,
      deliveryMode: 'async',
    });
  }

  private async handleVerifiedEmailChange(
    user: User,
    command: UpdateEmailCommand,
  ): Promise<void> {
    if (user.lastEmailModifiedAt) {
      const cooldownDays = configs.user.profileChangeCooldownDays;
      const cooldownMilliseconds = cooldownDays * 24 * 60 * 60 * 1000;
      const timeSinceLastChange =
        Date.now() - new Date(user.lastEmailModifiedAt).getTime();

      if (timeSinceLastChange < cooldownMilliseconds) {
        const daysRemaining = Math.ceil(
          (cooldownMilliseconds - timeSinceLastChange) /
            (24 * 60 * 60 * 1000),
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

    logger.info(
      `[UpdateEmail] CHECKPOINT 1: Handler received targetEmail=${command.email} for userId=${user.id} (isEmailChange=true, deliveryMode=async, verified=true)`,
    );

    await this.verificationEmailService.sendVerificationEmail({
      user,
      targetEmail: command.email,
      userAgent: command.userAgent,
      ipAddress: command.ipAddress,
      isEmailChange: true,
      updateUser: true,
      deliveryMode: 'async',
    });
  }
}
