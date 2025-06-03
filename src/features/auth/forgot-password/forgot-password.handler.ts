import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";

export class ForgotPasswordRequestModel {
  email: string;
  userAgent: string;
  ipAddress: string;
}

export class ForgotPasswordCommand {

  model: ForgotPasswordRequestModel;

  constructor(request: Partial<ForgotPasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const forgotPasswordValidations = Joi.object({
  email: Joi.string().email().required(),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordCommandHandler implements ICommandHandler<ForgotPasswordCommand> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: ForgotPasswordCommand): Promise<void> {

    const { model } = command;

    await forgotPasswordValidations.validateAsync(model)

    try {

      const user = await this.userRepository.getUserByEmailAsync(model.email);
      if (!user) {
        return;
      }

      // send email


    } catch (error) {
      logger.error("", error)
    }
  }
}