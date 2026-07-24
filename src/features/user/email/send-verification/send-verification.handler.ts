import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import { stringUtil } from '../../../../core/utils/string.util';
import { VerificationEmailService } from '../../../../infrastructure/services/verification-email.service';

export class SendVerificationEmailRequestModel {
  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty({ required: false })
  email: string;
}

export class SendVerificationEmailCommand {
  model: SendVerificationEmailRequestModel;

  constructor(request: Partial<SendVerificationEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

const sendVerificationEmailValidations = Joi.object({
  userAgent: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string()
    .required()
    .messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  email: Joi.string().email(),
});

@CommandHandler(SendVerificationEmailCommand)
export class SendVerificationEmailCommandHandler
  implements ICommandHandler<SendVerificationEmailCommand>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    private readonly verificationEmailService: VerificationEmailService,
  ) {}

  public async execute(command: SendVerificationEmailCommand): Promise<void> {
    const { model } = command;

    await sendVerificationEmailValidations.validateAsync(model);
    if (model.email) {
      model.email = stringUtil.normalizeEmail(model.email);
    }

    const user = await this.userRepository.getUserByEmailAsync(
      model.email,
      true,
    );
    if (!user) {
      logger.info(`User not found: ${model.email}`);
      return;
    }

    const isEmailChange =
      user.newEmail &&
      model.email &&
      user.newEmail.toLowerCase() === model.email.toLowerCase();

    if (!isEmailChange && user.emailConfirmed) {
      logger.info(
        `Verification email requested for already verified user ${user.id}`,
      );
      return;
    }

    const targetEmail = isEmailChange ? user.newEmail : user.email;

    await this.verificationEmailService.sendVerificationEmail({
      user,
      targetEmail,
      userAgent: model.userAgent,
      ipAddress: model.ipAddress,
      isEmailChange,
      deliveryMode: 'async',
    });
  }
}
