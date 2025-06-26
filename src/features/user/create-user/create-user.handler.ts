import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { UserModel } from "../../../domain/contracts/user.model";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../core/utils/const";
import { UserType } from "../../../domain/enums";
import { User } from "../../../domain/entities/user.entity";
import { password } from "../../../core/utils/validation.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { UserAlreadyExistsException } from "../../../core/exceptions/user.exception";

export class CreateUserModel {
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
    role: string;

    @ApiProperty()
    type: UserType;

    constructor(request: Partial<CreateUserModel> = {}) {
        Object.assign(this, request);
    }
}

export class CreateUserCommand {
    model: CreateUserModel

    constructor(request: Partial<CreateUserCommand> = {}) {
        Object.assign(this, request);
    }
}

const createUserValidations = Joi.object({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    gender: Joi.string().required(),
    type: Joi.string().valid(...Object.values(UserType)).required(),
    role: Joi.string().required()
});

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, UserModel> {
    constructor(
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    ) { }

    public async execute(command: CreateUserCommand): Promise<UserModel> {

        const { model } = command;
        await createUserValidations.validateAsync(model);

        let user = await this.userRepository.getUserByEmailAsync(model.email)
            ?? (() => { throw new UserAlreadyExistsException(model.email, "email") })();

        user = await this.userRepository.createAsync(
            new User({
                firstName: model.firstName,
                lastName: model.lastName,
                email: model.email,
                gender: model.gender,
            }), model.password);

        await this.userRepository.addToRoleAsync(user, model.role)

        const result = new UserModel({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            isEmailVerified: user.emailConfirmed,
        });

        return result;
    }
} 