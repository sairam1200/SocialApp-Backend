import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundException } from "../../../../core/exceptions/user.exception";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";

export class VerifyEmailRequestModel {
  @ApiProperty()
  email: string;

  @ApiProperty()
  code: string;
}

export class VerifyEmailResponseModel {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}

export class VerifyEmailCommand {
  model: VerifyEmailRequestModel;

  constructor(request: Partial<VerifyEmailCommand> = {}) {
    Object.assign(this, request);
  }
}

const verifyEmailValidations = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().required(),
});

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailCommandHandler implements ICommandHandler<VerifyEmailCommand, VerifyEmailResponseModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY) private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: VerifyEmailCommand): Promise<VerifyEmailResponseModel> {
    const { model } = command;

    await verifyEmailValidations.validateAsync(model);

    const user = await this.userRepository.getUserByEmailAsync(model.email, true);

    if (!user) {
      throw new UserNotFoundException();
    }

    const isEmailChange = user.newEmail && user.newEmail.toLowerCase() === model.email.toLowerCase();

    const dataProtectionKey = await this.validateVerificationCode(user.id, model.code, isEmailChange ? model.email : undefined);

    if (isEmailChange) {
      await this.userRepository.setEmailAsync(user, user.newEmail);
    } else {
      if (user.emailConfirmed) {
        await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
        return {
          success: true,
          message: "Email is already verified",
        };
      }
      user.emailConfirmed = true;
      await this.userRepository.updateAsync(user);
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);

    logger.info(`Email verified for user ${user.id}: ${model.email}${isEmailChange ? ' (email change completed)' : ''}`);

    return {
      success: true,
      message: isEmailChange ? "Email changed and verified successfully" : "Email verified successfully",
    };
  }

  private async validateVerificationCode(userId: string, code: string, email?: string): Promise<DataProtectionKey> {
    const verificationKeys = await this.dataProtectionKeyRepository.getByUserIdAsync(userId);
    const currentTime = Math.floor(Date.now() / 1000);

    const basePurpose = _const.TOKEN.PURPOSE.CONFIRM_EMAIL;
    const expectedKey = email ? `${basePurpose}:${email}` : basePurpose;

    const dataProtectionKey = verificationKeys.find(
      key =>
        key.key === expectedKey &&
        key.value === code &&
        key.expiresIn &&
        key.expiresIn >= currentTime
    );

    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid or expired verification code');
    }

    return dataProtectionKey;
  }
}

