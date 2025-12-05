import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import { FollowModel } from "../../../../domain/contracts/follow.model";
import { FollowStatus } from "../../../../domain/enums";
import { mapToFollowModel } from "../../../../domain/mappers/follow.mapper";
import { IUserFollowRepository } from "../../../../domain/repositories/iuserFollow.repository";

export class GetFollowersQuery {
  constructor(
    public userId: string,
    public status?: FollowStatus,
  ) { }
}

@QueryHandler(GetFollowersQuery)
export class GetFollowersQueryHandler implements IQueryHandler<GetFollowersQuery> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(query: GetFollowersQuery): Promise<FollowModel[]> {
    const statusFilter = query.status ?? FollowStatus.Accepted;
    const items = await this.follows.getFollowersAsync(query.userId, statusFilter);

    return items.map(mapToFollowModel);
  }
}
