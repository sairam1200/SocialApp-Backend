import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import { FollowListModel } from "../../../../domain/contracts/follow.model";
import { FollowStatus } from "../../../../domain/enums";
import { mapToFollowModel } from "../../../../domain/mappers/follow.mapper";
import { IUserFollowRepository } from "../../../../domain/repositories/iuserFollow.repository";

export class GetCommonFollowersQuery {
  constructor(
    public userId: string,
    public otherUserId: string
  ) { }
}

@QueryHandler(GetCommonFollowersQuery)
export class GetCommonFollowersQueryHandler implements IQueryHandler<GetCommonFollowersQuery> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(query: GetCommonFollowersQuery): Promise<FollowListModel> {
    const items = await this.follows.getCommonFollowersAsync(query.userId, query.otherUserId, FollowStatus.Accepted);
    return { items: items.map(mapToFollowModel) };
  }
}
