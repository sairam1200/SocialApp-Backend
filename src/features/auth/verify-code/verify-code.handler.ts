import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { IDataProtectionKeyRepository } from "../../../domain/repositories/idataProtectionKey.repository";

export class VerifyCodeRequestModel {
  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ example: "123456" })
  code: string;

  @ApiProperty({ example: _const.TOKEN.PURPOSE.RESET_PASSWORD })
  purpose: string;
}

export class VerifyCodeResponseModel {
  @ApiProperty({ example: true })
  isValid: boolean;

  @ApiProperty({ example: 3600, required: false, nullable: true })
  expiresIn?: number | null;
}

export class VerifyCodeCommand {
  model: VerifyCodeRequestModel;

  constructor(request: Partial<VerifyCodeCommand> = {}) {
    Object.assign(this, request);
  }
}

const verifyCodeValidations = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().required(),
  purpose: Joi.string().required(),
});

const AllowedPurposes = new Set<string>(Object.values(_const.TOKEN.PURPOSE));

@CommandHandler(VerifyCodeCommand)
export class VerifyCodeCommandHandler implements ICommandHandler<VerifyCodeCommand, VerifyCodeResponseModel> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: VerifyCodeCommand): Promise<VerifyCodeResponseModel> {

    const { model } = command;
    await verifyCodeValidations.validateAsync(model);

    const purpose = model.purpose.trim().toLowerCase();
    if (!AllowedPurposes.has(purpose)) {
      return { isValid: false, expiresIn: null };
    }

    const user = await this.userRepository.getUserByEmailAsync(model.email);
    if (!user) {
      return { isValid: false, expiresIn: null };
    }

    const dataProtectionKey = await this.dataProtectionKeyRepository.getByUserIdAndKeyAsync(user.id, purpose);
    if (!dataProtectionKey) {
      return { isValid: false, expiresIn: null };
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (dataProtectionKey.expiresIn && dataProtectionKey.expiresIn < currentTime) {
      return { isValid: false, expiresIn: 0 };
    }

    if (dataProtectionKey.value !== model.code) {
      return { isValid: false, expiresIn: dataProtectionKey.expiresIn ? Math.max(dataProtectionKey.expiresIn - currentTime, 0) : null };
    }

    const remainingLifetime = dataProtectionKey.expiresIn
      ? Math.max(dataProtectionKey.expiresIn - currentTime, 0)
      : null;

    return {
      isValid: true,
      expiresIn: remainingLifetime,
    };
  }
}

