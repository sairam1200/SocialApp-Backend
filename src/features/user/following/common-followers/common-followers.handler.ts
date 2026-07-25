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
import { IUserFollowRepository } from '../../../../domain/repositories/iuserFollow.repository';

export class GetCommonFollowersQuery {
  constructor(
    public userId: string,
    public otherUserId: string,
  ) {}
}

@QueryHandler(GetCommonFollowersQuery)
export class GetCommonFollowersQueryHandler implements IQueryHandler<GetCommonFollowersQuery> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
  ) {}

  public async execute(query: GetCommonFollowersQuery): Promise<FollowModel[]> {
    const items = await this.follows.getCommonFollowersAsync(
      query.userId,
      query.otherUserId,
      FollowStatus.Accepted,
    );

    const viewerUserId = HttpContext.getCurrentUserId;
    const avatars = await resolveFollowAvatars(
      items,
      viewerUserId,
      this.follows,
    );

    return items.map((f) => mapToFollowModel(f, avatars));
  }
}
