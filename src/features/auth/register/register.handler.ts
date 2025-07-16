import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { UserType } from "../../../domain/enums";
import { User } from "../../../domain/entities/user.entity";
import { stringUtil } from "../../../core/utils/string.util";
import { password } from "../../../core/utils/validation.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserModel } from "../../../domain/contracts/user.model";
import { mapToUserModel } from "../../../domain/mappers/user.mapper";
import { generateInitialImage } from "../../../core/utils/canvas.util";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { uploadBase64ToCloudinaryAsync } from "../../../core/utils/cloudinary.util";
import { UserAlreadyExistsException } from "../../../core/exceptions/user.exception";

export class RegisterModel {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  gender: string;

  @ApiProperty()
  phoneNumber: string;

  constructor(request: Partial<RegisterModel> = {}) {
    Object.assign(this, request);
  }
}

export class RegisterCommand {
  model: RegisterModel

  constructor(request: Partial<RegisterCommand> = {}) {
    Object.assign(this, request);
  }
}

const createUserValidations = Joi.object({
  email: Joi.string().required().email(),
  password: Joi.string().required().custom(password),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phoneNumber: Joi.string().required(),
  gender: Joi.string().required()
});

@CommandHandler(RegisterCommand)
export class RegisterCommandHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: RegisterCommand): Promise<UserModel> {

    const { model } = command;

    await createUserValidations.validateAsync(model);

    const existUser = await this.userRepository.getUserByEmailAsync(model.email);

    if (existUser) {
      throw new UserAlreadyExistsException(model.email, "email");
    }

    const initials = stringUtil.extractInitialsFromName(`${model.firstName} ${model.lastName}`);
    const base64Image = generateInitialImage(initials);

    const avatar = await uploadBase64ToCloudinaryAsync(base64Image, "users");

    const user = await this.userRepository.createAsync(
      new User({
        firstName: model.firstName,
        lastName: model.lastName,
        email: model.email,
        gender: model.gender,
        phoneNumber: model.phoneNumber,
        type: UserType.User,
        profileImage: avatar.secure_url,
      }), model.password);

    // TODO: Send Email  
    return mapToUserModel(user);
  }
} 