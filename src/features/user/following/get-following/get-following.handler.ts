import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PlaylistMember } from '../../../../domain/entities/collection/playlistMember.entity';
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

export class GetFollowingQuery {
  constructor(
    public userId: string,
    public status?: FollowStatus,
    public page: number = 1,
    public limit: number = 20,
  ) {}
}

@QueryHandler(GetFollowingQuery)
export class GetFollowingQueryHandler
  implements IQueryHandler<GetFollowingQuery>
{
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) {}

  public async execute(
    query: GetFollowingQuery,
  ): Promise<PaginatedResult<FollowModel>> {
    const statusFilter = query.status ?? FollowStatus.Accepted;
    const result = await this.follows.getFollowingPaginatedAsync(
      query.userId,
      query.page,
      query.limit,
      statusFilter,
    );

    const viewerUserId = HttpContext.getCurrentUserId;
    const avatars = await resolveFollowAvatars(
      result.items,
      viewerUserId,
      this.playlistMemberRepository,
    );

    return {
      ...result,
      items: result.items.map((f) => mapToFollowModel(f, avatars)),
    };
  }
}
