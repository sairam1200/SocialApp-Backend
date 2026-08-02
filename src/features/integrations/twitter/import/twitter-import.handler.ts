import axios from 'axios';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { UserLogin } from '../../../../domain/entities';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  deserializeObject,
  serializeObject,
} from 'core/utils/serialization.util';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IQueueService } from '../../../../domain/services/iqueue.service';
import { ITwitterImportService } from '../../../../domain/services/twitter/iX-import.service';
export class TwitterImportRequestModel {
  @ApiProperty()
  twitterAccessToken: string;
}

export class TwitterImportCommand {
  model: TwitterImportRequestModel;

  constructor(request: Partial<TwitterImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TwitterImportCommand)
export class TwitterImportCommandHandler implements ICommandHandler<TwitterImportCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
    @Inject(_const.ITWITTER_IMPORT_SERVICE)
    private readonly twitterImportService: ITwitterImportService,
  ) {}

  public async execute(command: TwitterImportCommand): Promise<{
    accessToken: string;
    expiresIn: number;
    importedCount: number;
  }> {
    let expiresIn: number;
    const { twitterAccessToken: twtterAccessToken } = command.model;
    let accessToken: string;
    const userId = HttpContext.getCurrentUserId;

    if (twtterAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(twtterAccessToken);
      const userLogin = await this.getUserLoginAsync(userId);
      if (!isTokenValid) {
        const tokenValue = deserializeObject<{
          access_token: string;
          refresh_token: string;
        }>(userLogin.tokenValue);
        const { access_token, expires_in, refresh_token } =
          await this.refreshTokenAsync(tokenValue.refresh_token);
        if (refresh_token) {

          userLogin.tokenValue = serializeObject({
            access_token,
            refresh_token,
          });
          userLogin.expiryDateUtc = new Date(
            Date.now() + 100 * 24 * 60 * 60 * 1000,
          ); // 100 days
          await this.userLoginRepository.updateAsync(userLogin);
        }

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = twtterAccessToken;
        expiresIn = userLogin.expiryDateUtc.getTime(); // Calculate remaining time in milliseconds
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const tokenValue = deserializeObject<{
        access_token: string;
        refresh_token: string;
      }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(
        tokenValue.access_token,
      );

      if (!isTokenValid) {
        const { access_token, expires_in, refresh_token } =
          await this.refreshTokenAsync(tokenValue.refresh_token);

        userLogin.tokenValue = serializeObject({ access_token, refresh_token });
        userLogin.expiryDateUtc = new Date(
          Date.now() + 100 * 24 * 60 * 60 * 1000,
        ); // 100 days
        await this.userLoginRepository.updateAsync(userLogin);

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = userLogin.expiryDateUtc.getTime(); // Calculate remaining time in milliseconds
      }
    }

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TWITTER,
        userId,
      );
    if (!account) {
      throw new NotFoundException('No matching Twitter profile was found!');
    }

    account.allowImport = true;
    await this.linkedAccountRepository.updateAsync(account);
    let importedCount = 0;
    try {
      logger.info('[TwitterImport] Refreshing profile');

      await this.twitterImportService.refreshProfileAsync(
        userId,
        accessToken,
        account.externalId,
      );

      logger.info('[TwitterImport] Importing tweets');

      importedCount = await this.twitterImportService.importTweetsAsync(
        userId,
        accessToken,
        account.externalId,
      );
    } catch (error) {
      logger.error('Twitter import failed');

      if (axios.isAxiosError(error)) {
        logger.error(`Twitter API error: status=${error.response?.status}`);
      }

      throw error;
    }

    return {
      accessToken,
      expiresIn,
      importedCount,
    };
  }

  private async refreshTokenAsync(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
  }> {
    logger.debug('[TwitterImport] Refreshing token');
    const basicAuth = Buffer.from(
      `${configs.twitter.clientId}:${configs.twitter.clientSecret}`,
    ).toString('base64');

    try {
      const response = await axios.post(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );
      logger.debug('[TwitterImport] Token refreshed');

      const { access_token, expires_in, refresh_token } = response.data;
      if (!access_token) {
        throw new ApplicationException(
          'Your twitter session has expired or the access token is invalid. Please log in to Twitter again to continue.',
        );
      }
      return {
        access_token,
        expires_in,
        refresh_token,
      };
    } catch (error) {
      //console.log('Error refreshing Twitter token', error);
      logger.error(
        `An error occurred while processing the Twitter import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );

      throw new UnauthorizedException(
        'No Twitter account linked to your user profile. Please re-link your Twitter account to proceed.',
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const res = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      // If user data exists, token is valid
      return !!res.data?.data?.id;
    } catch (error) {
      logger.error('Twitter access token verification failed');
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    const now = new Date();
    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.TWITTER,
      );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Twitter account linked to your user profile. Please link your Twitter account to proceed.',
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Twitter session has expired or the access token is invalid. Please log in to Twitter again to continue.',
      );
    }

    return userLogin;
  }
}
