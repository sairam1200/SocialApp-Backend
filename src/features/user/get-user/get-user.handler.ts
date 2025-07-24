import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserModel } from "../../../domain/contracts/user.model";
import { mapToUserModel } from "../../../domain/mappers/user.mapper";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";


export class GetUserQuery {
  userName: string;

  constructor(request: Partial<GetUserQuery> = {}) {
    Object.assign(this, request);
  }
}

const getUserQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required()
  })
};


@CommandHandler(GetUserQuery)
export class GetUserQueryHandler implements ICommandHandler<GetUserQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: GetUserQuery): Promise<UserModel> {

    await getUserQueryValidations.params.validateAsync(query);

    const user = await this.userRepository.getUserByNameAsync(query.userName);

    if (!user) {
      throw new UserNotFoundException();
    }

    return mapToUserModel(user)
  }
}  