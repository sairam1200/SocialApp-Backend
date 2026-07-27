import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import _const from '../../../../core/utils/const';
import { FollowModel } from '../../../../domain/contracts/follow.model';
import { FollowStatus } from '../../../../domain/enums';
import {
  mapToFollowModel,
  resolveFollowAvatars,
} from '../../../../domain/mappers/follow.mapper';
import {
  IUserFollowRepository,
  PaginatedResult,
} from '../../../../domain/repositories/iuserFollow.repository';

export class GetFollowersQuery {
  constructor(
    public userId: string,
    public status?: FollowStatus,
    public page: number = 1,
    public limit: number = 20,
  ) {}
}

@QueryHandler(GetFollowersQuery)
export class GetFollowersQueryHandler implements IQueryHandler<GetFollowersQuery> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
  ) {}

  public async execute(
    query: GetFollowersQuery,
  ): Promise<PaginatedResult<FollowModel>> {
    const statusFilter = query.status ?? FollowStatus.Accepted;
    const result = await this.follows.getFollowersPaginatedAsync(
      query.userId,
      query.page,
      query.limit,
      statusFilter,
    );

    const viewerUserId = HttpContext.getCurrentUserId;
    const avatars = await resolveFollowAvatars(
      result.items,
      viewerUserId,
      this.follows,
    );

    return {
      ...result,
      items: result.items.map((f) => mapToFollowModel(f, avatars)),
    };
  }
}
