import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { password } from "../../../core/utils/validation.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";
import ApplicationException from "../../../core/exceptions/application.exception";
import { DataProtectionKey } from "../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../domain/repositories/irefreshtoken.repository";
import { IDataProtectionKeyRepository } from "domain/repositories/idataProtectionKey.repository";

export class ResetPasswordRequestModel {
  code: string;
  userAgent: string;
  ipAddress: string;
  newPassword: string;
}

export class ResetPasswordCommand {

  model: ResetPasswordRequestModel;

  constructor(request: Partial<ResetPasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const resetPasswordValidations = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required().custom(password),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  deviceId: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordCommandHandler implements ICommandHandler<ResetPasswordCommand> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: ResetPasswordCommand)
    : Promise<any> {

    const { model } = command;
    await resetPasswordValidations.validateAsync(model);

    const dataProtectionKey = await this.validateCode(model.code);
    const user = await this.userRepository.getUserByEmailAsync(dataProtectionKey.userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    const result = await this.userRepository.updatePassword(user, model.newPassword);
    if (!result) {
      throw new ApplicationException('Failed to update password. Please try again later.');
    }

    

  }

  private async validateCode(code: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(code);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid code parameter');
    }

    if (new Date(dataProtectionKey.createdOn.getTime() + dataProtectionKey.expiresIn * 1000) < new Date()) {
      throw new ApplicationException('code parameter has expired');
    }

    return dataProtectionKey;
  }
}