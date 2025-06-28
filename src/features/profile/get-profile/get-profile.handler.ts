import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { Identities, ProfileModel } from "../../../domain/contracts/profile.model";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";
import { ILinkedAccountRepository } from "domain/repositories";


export class GetProfileQuery {
    userId: string;

    constructor(request: Partial<GetProfileQuery> = {}) {
        Object.assign(this, request);
    }
}

const getUserQueryValidations = {
    params: Joi.object().keys({
        userId: Joi.string().required()
    })
};


@CommandHandler(GetProfileQuery)
export class GetProfileHandler implements ICommandHandler<GetProfileQuery> {
    constructor(
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository, @Inject(_const.ILINKEDACCOUNT_REPOSITORY)  private readonly linkedAccountRepository: ILinkedAccountRepository
    ) { }

    public async execute(query: GetProfileQuery): Promise<ProfileModel> {

        await getUserQueryValidations.params.validateAsync(query);

        const user = await this.userRepository.getUserByIdAsync(query.userId);
        if (!user) {
            throw new UserNotFoundException(query.userId);
        }
        const linkedAccount = await this.linkedAccountRepository.getByUserIdAsync(query.userId)

        

        const result = new ProfileModel({
            id: user.id,
            name: user.firstName + " " + user.lastName,
            identities: linkedAccount.map(function (account) : Identities{
                return {
                    platform:account.platform,
                    username:account.userName,
                    verified:account.verified
                }
            })
        });

        return result;
    }
}  