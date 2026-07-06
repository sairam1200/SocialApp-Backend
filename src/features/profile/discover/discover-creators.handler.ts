import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { PublicProfileModel } from '../../../domain/contracts/public-profile.model';
import {
  IUserRepository,
  IUserFollowRepository,
  ILinkedAccountRepository,
} from '../../../domain/repositories';
import { FollowStatus, UserType } from '../../../domain/enums';
import { User } from '../../../domain/entities';
import { mapToPublicProfileModel } from '../../../domain/mappers/public-profile.mapper';
import { mapToLinkedAccountsModel } from '../../../domain/mappers/user.mapper';
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
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  async execute(query: DiscoverCreatorsQuery): Promise<{
    profiles: PublicProfileModel[];
    page: number;
    limit: number;
    totalResults: number;
    hasNextPage: boolean;
  }> {
    await validateDiscoverCreatorsQuery.validateAsync(query);

    const [users, total] = await this.userRepository.getDiscoverCreatorsAsync(
      query.page,
      query.limit,
    );
    const hasNextPage = query.page * query.limit < total;

    const viewerUserId = HttpContext.getCurrentUserId;

    const profiles = await Promise.all(
      users.map(async (user: User) => {
        const linkedAccounts =
          (await this.linkedAccountRepository.getByUserIdAsync(user.id)) || [];
        const followersCount =
          await this.userFollowRepository.countFollowersAsync(user.id);
        const followingCount =
          await this.userFollowRepository.countFollowingAsync(user.id);

        let profileImageUrl: string | null = null;
        if (user.biometrics) {
          profileImageUrl =
            user.biometrics.profileImageUrl ||
            user.biometrics.defaultProfileImageUrl ||
            null;
        }

        const follow = viewerUserId
          ? await this.userFollowRepository.getAsync(viewerUserId, user.id)
          : null;
        const isFollowing = !!(
          follow && follow.status === FollowStatus.Accepted
        );

        return mapToPublicProfileModel({
          user,
          profileImage: profileImageUrl,
          followersCount,
          followingCount,
          connectedPlatformsCount: linkedAccounts.length,
          totalPosts: 0,
          isFollowing,
          linkedAccounts: linkedAccounts.map(mapToLinkedAccountsModel),
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
