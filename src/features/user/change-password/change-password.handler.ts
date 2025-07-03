import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../core/exceptions/application.exception";

export class ChangePasswordRequestModel {
  @ApiProperty()
  currentPassword: string;

  @ApiProperty()
  newPassword: string;

  @ApiProperty()
  userAgent: string;

  @ApiProperty()
  ipAddress: string;
}

export class ChangePasswordCommand {

  model: ChangePasswordRequestModel;

  constructor(request: Partial<ChangePasswordCommand> = {}) {
    Object.assign(this, request);
  }
}

const changePasswordValidations = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().required(),
  userAgent: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
  ipAddress: Joi.string().required().messages({ 'any.required': ' Prevented: Adulterated Request Received!' }),
});

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler implements ICommandHandler<ChangePasswordCommand> {

  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: ChangePasswordCommand): Promise<void> {

    const { model } = command;

    await changePasswordValidations.validateAsync(model)

    try {

      const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
      if (!user) {
        throw new UserNotFoundException();
      }

      const result = await this.userRepository.changePasswordAsync(user, model.currentPassword, model.newPassword);
      if (!result) {
        throw new ApplicationException("")
      }

      // # TODO # send email
      // # TODO # logout other users


    } catch (error) {
      logger.error("", error)
    }
  }
}