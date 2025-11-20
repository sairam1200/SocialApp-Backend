import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { UserModel } from "../../../domain/contracts/user.model";
import { mapToUserModel } from "../../../domain/mappers/user.mapper";
import { PlaylistMember } from "../../../domain/entities/collection/playlistMember.entity";
import { PagedResult } from "../../../domain/contracts/pagination/pagedResult";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { isProfileImageVisible } from "../../../core/utils/profileImagePrivacy.util";
import { ProfileImagePrivacy } from "../../../domain/enums";

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
  orderBy: Joi.string().valid('id', 'firstname', 'lastname', 'email').default('id'),
  order: Joi.string().valid('ASC', 'DESC').default('ASC'),
  searchTerm: Joi.string().allow(null).optional()
});

@CommandHandler(GetUsersQuery)
export class GetUsersQueryHandler implements ICommandHandler<GetUsersQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @InjectRepository(PlaylistMember) private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) { }

  async execute(command: GetUsersQuery): Promise<PagedResult<UserModel[]>> {
    await getUsersValidations.validateAsync(command);

    const [usersEntity, total] = await this.userRepository.getEntriesAsync(
      command.page,
      command.pageSize,
      command.orderBy,
      command.order,
      command.searchTerm
    );

    if (!usersEntity || usersEntity.length === 0) return new PagedResult<UserModel[]>([], total);

    const viewerUserId = HttpContext.getCurrentUserId;
    const users = await Promise.all(
      usersEntity.map(async (user) => {
        const canViewProfileImage = await isProfileImageVisible(
          user.profileImagePrivacy || ProfileImagePrivacy.Everyone,
          user.id,
          viewerUserId,
          this.playlistMemberRepository
        );
        return mapToUserModel(user, false, canViewProfileImage);
      })
    );
    return new PagedResult<UserModel[]>(users, total);
  }
}