import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { UserModel } from '../../../domain/contracts/user.model';
import { mapToUserModel } from '../../../domain/mappers/user.mapper';
import { PagedResult } from '../../../domain/contracts/pagination/pagedResult';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { IUserFollowRepository } from '../../../domain/repositories/iuserFollow.repository';
import { getProfileImageUrl } from '../../../core/utils/profileImagePrivacy.util';

export class GetUsersQuery {
  page = 1;
  pageSize = 10;
  orderBy = 'id';
  order: 'ASC' | 'DESC' = 'ASC';
  searchTerm?: string = null;

  constructor(request: Partial<GetUsersQuery> = {}) {
    Object.assign(this, request);
  }
}

const getUsersValidations = Joi.object<GetUsersQuery>({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(10),
  orderBy: Joi.string()
    .valid('id', 'firstname', 'lastname', 'email')
    .default('id'),
  order: Joi.string().valid('ASC', 'DESC').default('ASC'),
  searchTerm: Joi.string().allow(null).optional(),
});

@CommandHandler(GetUsersQuery)
export class GetUsersQueryHandler implements ICommandHandler<GetUsersQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
  ) {}

  async execute(command: GetUsersQuery): Promise<PagedResult<UserModel[]>> {
    await getUsersValidations.validateAsync(command);

    const [usersEntity, total] = await this.userRepository.getEntriesAsync(
      command.page,
      command.pageSize,
      command.orderBy,
      command.order,
      command.searchTerm,
    );

    if (!usersEntity || usersEntity.length === 0)
      return new PagedResult<UserModel[]>([], total);

    const viewerUserId = HttpContext.getCurrentUserId;
    const users = await Promise.all(
      usersEntity.map(async (user) => {
        let profileImageUrl: string | null = null;

        if (user.biometrics) {
          profileImageUrl = await getProfileImageUrl(
            user.biometrics.profileImageUrl,
            user.biometrics.defaultProfileImageUrl,
            user.biometrics.privacy,
            user.id,
            viewerUserId,
            this.userFollowRepository,
          );
        }

        return mapToUserModel(user, false, profileImageUrl);
      }),
    );
    return new PagedResult<UserModel[]>(users, total);
  }
}
