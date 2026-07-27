import axios from 'axios';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UserLogin } from '../../../../domain/entities';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';

import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IInstagramImportService } from '../../../../domain/services/instagram/iInstagram-import.service';
import { deserializeObject } from '../../../../core/utils/serialization.util';
export class InstagramImportRequestModel {
  @ApiProperty()
  instagramAccessToken: string;
}

export class InstagramImportCommand {
  model: InstagramImportRequestModel;

  constructor(request: Partial<InstagramImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramImportCommand)
export class InstagramImportCommandHandler implements ICommandHandler<InstagramImportCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,

    @Inject(_const.IINSTAGRAM_IMPORT_SERVICE)
    private readonly instagramImportService: IInstagramImportService,
  ) {}

  public async execute(command: InstagramImportCommand): Promise<{
    accessToken: string;
    expiresIn: number;
    importedCount: number;
  }> {
    let expiresIn = 0;
    let accessToken: string;

    const now = new Date();
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const { instagramAccessToken } = command.model;

    if (instagramAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(instagramAccessToken);

      if (isTokenValid) {
        accessToken = instagramAccessToken;
        expiresIn = 60 * 60 * 24 * 60; // fallback
      } else {
        const userLogin = await this.getUserLoginAsync(userId);

        const tokenData = deserializeObject(userLogin.tokenValue) as {
          access_token: string;
          expires_in: number;
        };
        const accessTokenFromDb = tokenData.access_token;

        const fallbackTokenValid =
          await this.verifyAccessTokenAsync(accessTokenFromDb);
        if (!fallbackTokenValid) {
          throw new ApplicationException(
            'Your Instagram session has expired or the access token is invalid. Please log in to Instagram again to continue.',
          );
        }

        accessToken = accessTokenFromDb;

        expiresIn = Math.floor(
          (userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000,
        );
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);

      const tokenData = deserializeObject(userLogin.tokenValue) as {
        access_token: string;
        expires_in: number;
      };

      const accessTokenFromDb = tokenData.access_token;

      const isTokenValid = await this.verifyAccessTokenAsync(accessTokenFromDb);

      if (!isTokenValid) {
        throw new ApplicationException('RECONNECT_REQUIRED');
      }

      accessToken = accessTokenFromDb;

      expiresIn = Math.floor(
        (userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000,
      );
    }

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.INSTAGRAM,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Instagram profile was found!');
    }

    account.allowImport = true;

    await this.linkedAccountRepository.updateAsync(account);

    logger.info('[InstagramImport] Refreshing profile');

    try {
      await this.instagramImportService.refreshProfileAsync(
        userId,
        accessToken,
        account.externalId,
      );
    } catch (error: any) {
      logger.error('[InstagramImport] Refresh profile error', {
        status: error?.response?.status,
      });
      throw error;
    }

    logger.info('[InstagramImport] Importing media');

    try {
      const importedCount = await this.instagramImportService.importMediaAsync(
        userId,
        accessToken,
        account.externalId,
      );

      return {
        accessToken,
        expiresIn,
        importedCount,
      };
    } catch (error: any) {
      logger.error('[InstagramImport] Import media error', {
        status: error?.response?.status,
      });
      throw error;
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://graph.instagram.com/me', {
        params: {
          fields: 'id,username',
          access_token: accessToken,
        },
      });

      return !!response.data?.id;
    } catch (error: any) {
      logger.error('[InstagramImport] Token verification failed', {
        status: error?.response?.status,
      });

      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    const now = new Date();

    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.INSTAGRAM,
      );

    if (!userLogin) {
      throw new ApplicationException(
        'No Instagram account linked to your user profile. Please link your Instagram account to proceed.',
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new ApplicationException('RECONNECT_REQUIRED');
    }

    return userLogin;
  }
}
