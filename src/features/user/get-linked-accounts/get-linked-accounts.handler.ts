import * as Joi from "joi";
import { Inject, NotFoundException } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { UserNotFoundException } from "../../../core/exceptions/user.exception";
import { ILinkedAccountRepository } from "../../../domain/repositories";
import { mapToLinkedAccountsModel } from "../../../domain/mappers/user.mapper";
import { LinkedAccountModel } from "../../../domain/contracts/user.model";


export class GetUserLinkedAccountsQuery {
    userId: string;

    constructor(request: Partial<GetUserLinkedAccountsQuery> = {}) {
        Object.assign(this, request);
    }
}

const getUserQueryValidations = {
    params: Joi.object().keys({
        userId: Joi.string().required()
    })
};


@CommandHandler(GetUserLinkedAccountsQuery)
export class GetUserLinkedAccountsQueryHandler implements ICommandHandler<GetUserLinkedAccountsQuery,LinkedAccountModel[]> {
    constructor(
        @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository, @Inject(_const.ILINKEDACCOUNT_REPOSITORY)  private readonly linkedAccountRepository: ILinkedAccountRepository
    ) { }

    public async execute(query: GetUserLinkedAccountsQuery): Promise<LinkedAccountModel[]> {

        await getUserQueryValidations.params.validateAsync(query);

        const user = await this.userRepository.getUserByIdAsync(query.userId);
        if (!user) {
            throw new UserNotFoundException(query.userId);
        }
        const linkedAccount = await this.linkedAccountRepository.getByUserIdAsync(query.userId)

        if(!linkedAccount){
            return []
        }
      
        return linkedAccount.map(mapToLinkedAccountsModel);
    }
}  