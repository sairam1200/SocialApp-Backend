import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SpotifyProfileModel } from '../../../../domain/contracts/spotify.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { mapToSpotifyProfileModel } from '../../../../domain/mappers/spotify.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = 'spotify';
export class SpotifyProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    spotifyId?: string;
  };

  constructor(request: Partial<SpotifyProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SpotifyProfileQuery)
export class SpotifyProfileQueryHandler implements ICommandHandler<SpotifyProfileQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    query: SpotifyProfileQuery,
  ): Promise<SpotifyProfileModel> {
    const { model } = query;

    const account = model.userId
      ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          PLATFORM,
          model.userId,
        )
      : model.userName
        ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(
            PLATFORM,
            model.userName,
          )
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
            PLATFORM,
            model.spotifyId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Spotify profile was found based on the provided information.',
      );
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToSpotifyProfileModel(account, includeSensitiveFields);
  }
}
