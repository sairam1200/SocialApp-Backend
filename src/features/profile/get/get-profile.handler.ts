import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import _const from "../../../core/utils/const";
import { Globals } from "../../../core/globals";
import { UserType, ProfileImagePrivacy } from "../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundException } from "../../../core/exceptions";
import { ProfileModel } from "../../../domain/contracts/profile.model";
import { mapToProfileModel } from "../../../domain/mappers/profile.mapper";
import { PlaylistMember } from "../../../domain/entities/collection/playlistMember.entity";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../domain/repositories/iuser.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { IManualProfileRepository } from "../../../domain/repositories/imanualProfile.repository";
import { isProfileImageVisible } from "../../../core/utils/profileImagePrivacy.util";

export class GetProfileQuery {
  userName: string;

  constructor(request: Partial<GetProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

const getProfileQueryValidations = {
  params: Joi.object().keys({
    userName: Joi.string().required()
  })
};

@CommandHandler(GetProfileQuery)
export class GetProfileQueryHandler implements ICommandHandler<GetProfileQuery, ProfileModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY) private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY) private readonly manualProfileRepository: IManualProfileRepository,
    @InjectRepository(PlaylistMember) private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) { }

  public async execute(query: GetProfileQuery): Promise<ProfileModel> {

    await getProfileQueryValidations.params.validateAsync(query);

    const user = await this.userRepository.getUserByNameAsync(query.userName);

    if (!user) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    if (user.type !== UserType.User) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    // Check if the logged-in user is viewing their own profile or has permission to view sensitive info
    const includeSensitiveFields = HttpContext.user
      ? (user.id === HttpContext.user[Globals.ClaimTypes.UserId]
        || HttpContext.user.permission?.some(a => a === "viewuser")) : false;

    const linkedAccounts = await this.linkedAccountRepository.getByUserIdAsync(user.id) || [];
    const manualProfiles = await this.manualProfileRepository.getByUserIdAsync(user.id) || [];

    const viewerUserId = HttpContext.getCurrentUserId;
    const canViewProfileImage = await isProfileImageVisible(
      user.profileImagePrivacy || ProfileImagePrivacy.Everyone,
      user.id,
      viewerUserId,
      this.playlistMemberRepository
    );

    return mapToProfileModel(user, linkedAccounts, manualProfiles, includeSensitiveFields, canViewProfileImage);
  }
}

