import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { UserModel } from '../../../domain/contracts/user.model';
import { mapToUserModel } from '../../../domain/mappers/user.mapper';
import { PlaylistMember } from '../../../domain/entities/collection/playlistMember.entity';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
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
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberRepository: Repository<PlaylistMember>,
  ) {}

  public async execute(query: GetUserQuery): Promise<UserModel> {
    await getUserQueryValidations.params.validateAsync(query);
    const userName = decodeURIComponent(query.userName);
    const user = await this.userRepository.getUserByNameAsync(userName);
    if (!user) {
      throw new UserNotFoundException(query.userName, 'username');
    }

    const viewerUserId = HttpContext.getCurrentUserId;
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

    return mapToUserModel(user, true, profileImageUrl);
  }
}
