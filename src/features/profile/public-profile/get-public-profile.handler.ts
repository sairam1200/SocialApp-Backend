import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import _const from '../../../core/utils/const';
import { UserType, ProfilePrivacy, FollowStatus } from '../../../domain/enums';
import { UserNotFoundException } from '../../../core/exceptions';
import { PublicProfileModel } from '../../../domain/contracts/public-profile.model';
import { PlaylistMember } from '../../../domain/entities/collection/playlistMember.entity';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IManualProfileRepository } from '../../../domain/repositories/imanualProfile.repository';
import { IUserFollowRepository } from '../../../domain/repositories/iuserFollow.repository';
import { ProfileCacheService } from '../../../infrastructure/services/profileCache.service';
import { getProfileImageUrl } from '../../../core/utils/profileImagePrivacy.util';
import { mapToLinkedAccountsModel } from '../../../domain/mappers/user.mapper';
import { mapToManualProfileModel } from '../../../domain/mappers/manualProfile.mapper';
import { mapToPublicProfileModel } from '../../../domain/mappers/public-profile.mapper';

export class GetPublicProfileQuery {
  userName: string;

  constructor(request: Partial<GetPublicProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

const getPublicProfileQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required(),
  }),
};

@CommandHandler(GetPublicProfileQuery)
export class GetPublicProfileQueryHandler
  implements ICommandHandler<GetPublicProfileQuery, PublicProfileModel>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberRepository: Repository<PlaylistMember>,
    private readonly profileCache: ProfileCacheService,
  ) {}

  public async execute(
    query: GetPublicProfileQuery,
  ): Promise<PublicProfileModel> {
    await getPublicProfileQueryValidations.params.validateAsync(query);

    const decodedUserName = decodeURIComponent(query.userName);

    const user = await this.userRepository.getUserByNameAsync(decodedUserName);

    if (!user) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    if (user.type !== UserType.User) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    // Check cache first (cache-aside pattern)
    const cached = await this.profileCache.getCachedProfile(user.id);
    if (cached) {
      return cached;
    }

    const viewerUserId = HttpContext.getCurrentUserId;
    const isOwnProfile = viewerUserId === user.id;

    if (user.profilePrivacy === ProfilePrivacy.Private && !isOwnProfile) {
      if (!viewerUserId) {
        throw new UserNotFoundException(query.userName, 'username');
      }
      const follow = await this.userFollowRepository.getAsync(
        viewerUserId,
        user.id,
      );
      if (!follow || follow.status !== FollowStatus.Accepted) {
        throw new UserNotFoundException(query.userName, 'username');
      }
    }

    const linkedAccounts =
      (await this.linkedAccountRepository.getByUserIdAsync(user.id)) || [];
    const manualProfiles =
      (await this.manualProfileRepository.getByUserIdAsync(user.id)) || [];

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

    const followersCount = await this.userFollowRepository.countFollowersAsync(
      user.id,
      FollowStatus.Accepted,
    );
    const followingCount = await this.userFollowRepository.countFollowingAsync(
      user.id,
      FollowStatus.Accepted,
    );

    const follow = viewerUserId
      ? await this.userFollowRepository.getAsync(viewerUserId, user.id)
      : null;
    const isFollowing = !!(follow && follow.status === FollowStatus.Accepted);

    const profile = mapToPublicProfileModel({
      user,
      profileImage: profileImageUrl,
      followersCount,
      followingCount,
      connectedPlatformsCount: linkedAccounts.length,
      totalPosts: 0,
      isFollowing,
      linkedAccounts: linkedAccounts.map(mapToLinkedAccountsModel),
    });

    // Populate cache
    await this.profileCache.setCachedProfile(user.id, profile);

    return profile;
  }
}
