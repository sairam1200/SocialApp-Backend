import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { UserType } from '../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ILinkedAccountRepository } from '../../../domain/repositories';
import { LinkedAccountModel } from '../../../domain/contracts/user.model';
import { mapToLinkedAccountsModel } from '../../../domain/mappers/user.mapper';
import { UserNotFoundException } from '../../../core/exceptions/user.exception';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';

export class GetUserLinkedAccountsQuery {
  userName: string;

  constructor(request: Partial<GetUserLinkedAccountsQuery> = {}) {
    Object.assign(this, request);
  }
}

const getUserQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required(),
  }),
};

@CommandHandler(GetUserLinkedAccountsQuery)
export class GetUserLinkedAccountsQueryHandler implements ICommandHandler<
  GetUserLinkedAccountsQuery,
  LinkedAccountModel[]
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    query: GetUserLinkedAccountsQuery,
  ): Promise<LinkedAccountModel[]> {
    await getUserQueryValidations.params.validateAsync(query);

    const user = await this.userRepository.getUserByNameAsync(query.userName);
    if (!user && user.type !== UserType.User) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    if (user.type !== UserType.User) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    const linkedAccount = await this.linkedAccountRepository.getByUserIdAsync(
      user.id,
    );
    if (!linkedAccount) {
      return [];
    }

    return linkedAccount.map(mapToLinkedAccountsModel);
  }
}
