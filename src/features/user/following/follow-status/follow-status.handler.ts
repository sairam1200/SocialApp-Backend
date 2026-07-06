import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { FollowStatusModel } from '../../../../domain/contracts/follow-status.model';
import { FollowStatus } from '../../../../domain/enums';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserFollowRepository } from '../../../../domain/repositories/iuserFollow.repository';

export class GetFollowStatusQuery {
  constructor(public targetUserId: string) {}
}

@QueryHandler(GetFollowStatusQuery)
export class GetFollowStatusQueryHandler
  implements IQueryHandler<GetFollowStatusQuery, FollowStatusModel>
{
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
  ) {}

  public async execute(
    query: GetFollowStatusQuery,
  ): Promise<FollowStatusModel> {
    const viewerUserId = HttpContext.getCurrentUserId;

    if (!viewerUserId) {
      return {
        isFollowing: false,
        requested: false,
        canFollow: true,
      };
    }

    if (viewerUserId === query.targetUserId) {
      return {
        isFollowing: false,
        requested: false,
        canFollow: false,
      };
    }

    const existing = await this.follows.getAsync(
      viewerUserId,
      query.targetUserId,
    );

    if (!existing) {
      return {
        isFollowing: false,
        requested: false,
        canFollow: true,
      };
    }

    const isFollowing = existing.status === FollowStatus.Accepted;
    const requested = existing.status === FollowStatus.Requested;
    const canFollow = existing.status !== FollowStatus.Blocked && !isFollowing;

    return {
      isFollowing,
      requested,
      canFollow,
    };
  }
}
