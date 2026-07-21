import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { UserModel } from '../../../domain/contracts/user.model';
import { FollowStatus, ProfilePrivacy } from '../../../domain/enums';
import { mapToUserModel } from '../../../domain/mappers/user.mapper';
import {
  IIdentityRepository,
  IUserFollowRepository,
} from '../../../domain/repositories';
import { UserNotFoundException } from '../../../core/exceptions/user.exception';
import { getProfileImageUrl } from '../../../core/utils/profileImagePrivacy.util';

export class GetUserQuery {
  userName: string;

  constructor(request: Partial<GetUserQuery> = {}) {
    Object.assign(this, request);
  }
}

const getUserQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required(),
  }),
};

@CommandHandler(GetUserQuery)
export class GetUserQueryHandler implements ICommandHandler<GetUserQuery> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
  ) {}

  public async execute(query: GetUserQuery): Promise<UserModel> {
    await getUserQueryValidations.params.validateAsync(query);
    const userName = decodeURIComponent(query.userName);
    const user = await this.userRepository.getUserByNameAsync(userName);
    if (!user) {
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

    let profileImageUrl: string | null = null;

    if (user.biometrics) {
      profileImageUrl = await getProfileImageUrl(
        user.biometrics.profileImageUrl,
        user.biometrics.defaultProfileImageUrl,
        user.biometrics.privacy,
        user.id,
        viewerUserId,
        this.userFollowRepository,
      );
    }

    return mapToUserModel(user, true, profileImageUrl);
  }
}
