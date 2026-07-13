import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import _const from '../../../core/utils/const';
import { Globals } from '../../../core/globals';
import { UserType, ProfilePrivacy, FollowStatus } from '../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../core/exceptions';
import { ProfileModel } from '../../../domain/contracts/profile.model';
import { mapToProfileModel } from '../../../domain/mappers/profile.mapper';
import { PlaylistMember } from '../../../domain/entities/collection/playlistMember.entity';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IManualProfileRepository } from '../../../domain/repositories/imanualProfile.repository';
import { IUserFollowRepository } from '../../../domain/repositories/iuserFollow.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { getProfileImageUrl } from '../../../core/utils/profileImagePrivacy.util';

export class GetProfileQuery {
  userName: string;

  constructor(request: Partial<GetProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

const getProfileQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required(),
  }),
};

@CommandHandler(GetProfileQuery)
export class GetProfileQueryHandler
  implements ICommandHandler<GetProfileQuery, ProfileModel>
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
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(query: GetProfileQuery): Promise<ProfileModel> {
    await getProfileQueryValidations.params.validateAsync(query);

    const decodedUserName = decodeURIComponent(query.userName);

    const user = await this.userRepository.getUserByNameAsync(decodedUserName);

    if (!user) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    if (user.type !== UserType.User) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    const viewerUserId = HttpContext.getCurrentUserId;
    const isOwnProfile = viewerUserId === user.id;

    // Enforce profile privacy: private profiles are invisible to non-followers
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

    // Check if the logged-in user has permission to view sensitive info
    const includeSensitiveFields =
      isOwnProfile ||
      (HttpContext.user?.permission?.some((a) => a === 'viewuser') ?? false);

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

    const follow =
      viewerUserId && !isOwnProfile
        ? await this.userFollowRepository.getAsync(viewerUserId, user.id)
        : null;
    const isFollowing = !!(follow && follow.status === FollowStatus.Accepted);

    const totalPosts = await this.userContentRepository.countByUserIdAsync(
      user.id,
    );

    return mapToProfileModel(
      user,
      linkedAccounts,
      manualProfiles,
      includeSensitiveFields,
      profileImageUrl,
      followersCount,
      followingCount,
      isFollowing,
      totalPosts,
    );
  }
}
