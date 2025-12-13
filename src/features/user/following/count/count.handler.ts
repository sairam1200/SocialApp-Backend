import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import { FollowCountsModel } from "../../../../domain/contracts/follow.model";
import { IUserFollowRepository } from "../../../../domain/repositories/iuserFollow.repository";
import { FollowStatus } from "../../../../domain/enums";

export class GetFollowCountsQuery {
  constructor(
    public userId: string
  ) { }
}

@QueryHandler(GetFollowCountsQuery)
export class GetFollowCountsQueryHandler implements IQueryHandler<GetFollowCountsQuery> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(query: GetFollowCountsQuery): Promise<FollowCountsModel> {
    const followers = await this.follows.countFollowersAsync(query.userId, FollowStatus.Accepted);
    const following = await this.follows.countFollowingAsync(query.userId, FollowStatus.Accepted);
    return { followers, following };
  }
}
