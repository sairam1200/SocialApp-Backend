import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { PublicProfileModel } from '../../../domain/contracts/public-profile.model';
import { IUserRepository } from '../../../domain/repositories';
import { User } from '../../../domain/entities';
import { mapToPublicProfileModel } from '../../../domain/mappers/public-profile.mapper';
import { PlaylistMember } from '../../../domain/entities/collection/playlistMember.entity';
import { getProfileImageUrl } from '../../../core/utils/profileImagePrivacy.util';
import _const from '../../../core/utils/const';

export class DiscoverCreatorsQuery {
  page = 1;
  limit = 12;

  constructor(request: Partial<DiscoverCreatorsQuery> = {}) {
    Object.assign(this, request);
  }
}

const validateDiscoverCreatorsQuery = Joi.object<DiscoverCreatorsQuery>({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(12),
});

@CommandHandler(DiscoverCreatorsQuery)
export class DiscoverCreatorsQueryHandler
  implements
    ICommandHandler<
      DiscoverCreatorsQuery,
      {
        profiles: PublicProfileModel[];
        page: number;
        limit: number;
        totalResults: number;
        hasNextPage: boolean;
      }
    >
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) {}

  async execute(query: DiscoverCreatorsQuery): Promise<{
    profiles: PublicProfileModel[];
    page: number;
    limit: number;
    totalResults: number;
    hasNextPage: boolean;
  }> {
    await validateDiscoverCreatorsQuery.validateAsync(query);

    const viewerUserId = HttpContext.getCurrentUserId;

    const [users, total] = await this.userRepository.getDiscoverCreatorsAsync(
      query.page,
      query.limit,
      viewerUserId,
    );
    const hasNextPage = query.page * query.limit < total;

    const userIds = users.map((u: User) => u.id);
    const statsMap = await this.userRepository.getUsersProfileStatsAsync(
      userIds,
      viewerUserId,
    );

    const profiles = await Promise.all(
      users.map(async (user: User) => {
        const stats = statsMap.get(user.id);

        let profileImageUrl: string | null = null;
        if (user.biometrics) {
          profileImageUrl = await getProfileImageUrl(
            user.biometrics.profileImageUrl,
            user.biometrics.defaultProfileImageUrl,
            user.biometrics.privacy,
            user.id,
            viewerUserId,
            this.playlistMemberRepository,
          );
        }

        return mapToPublicProfileModel({
          user,
          profileImage: profileImageUrl,
          followersCount: stats?.followersCount ?? 0,
          followingCount: stats?.followingCount ?? 0,
          connectedPlatformsCount: stats?.linkedAccounts?.length ?? 0,
          totalPosts: stats?.totalPosts ?? 0,
          isFollowing: stats?.isFollowing ?? false,
          linkedAccounts: (stats?.linkedAccounts ?? []).map((la) => ({
            id: la.id,
            username: la.username ?? '',
            platform: la.platform,
          })),
        });
      }),
    );

    return {
      profiles,
      page: query.page,
      limit: query.limit,
      totalResults: total,
      hasNextPage,
    };
  }
}
