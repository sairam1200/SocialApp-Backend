import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import {
  IOAuthService,
  OAuthTokenResult,
} from '../../../domain/services/publishing/ioauth.service';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { cryptoUtils } from '../../../core/utils/crypto.util';
import configs from '../../../configs';
import { PublishAuthError } from '../../../core/exceptions/publishing.exception';

@Injectable()
export class OAuthService implements IOAuthService {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepo: IYoutubeAccountRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
  ) {}

  async getValidAccessToken(
    userId: string,
    platform: string,
  ): Promise<OAuthTokenResult> {
    switch (platform) {
      case _const.PLATFORMS.YOUTUBE:
        return this.getYouTubeAccessToken(userId);
      default:
        throw new PublishAuthError(
          `OAuth not configured for platform: ${platform}`,
        );
    }
  }

  async refreshToken(
    userId: string,
    platform: string,
  ): Promise<OAuthTokenResult> {
    switch (platform) {
      case _const.PLATFORMS.YOUTUBE:
        return this.refreshYouTubeToken(userId);
      default:
        throw new PublishAuthError(
          `OAuth refresh not configured for platform: ${platform}`,
        );
    }
  }

  private async getYouTubeAccessToken(
    userId: string,
  ): Promise<OAuthTokenResult> {
    const account = await this.youtubeAccountRepo.getByUserIdAsync(userId);
    if (!account) {
      throw new PublishAuthError('YouTube account not found');
    }

    const now = new Date();
    if (account.tokenExpiry && account.tokenExpiry > now) {
      return {
        accessToken: cryptoUtils.decrypt(account.accessToken),
        expiresAt: account.tokenExpiry,
      };
    }

    return this.refreshYouTubeToken(userId);
  }

  private async refreshYouTubeToken(userId: string): Promise<OAuthTokenResult> {
    const account = await this.youtubeAccountRepo.getByUserIdAsync(userId);
    if (!account) {
      throw new PublishAuthError('YouTube account not found');
    }
    if (!account.refreshToken) {
      throw new PublishAuthError('YouTube refresh token missing');
    }

    const refreshToken = cryptoUtils.decrypt(account.refreshToken);

    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: configs.youtube.clientId,
        client_secret: configs.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const { access_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      account.accessToken = cryptoUtils.encrypt(access_token);
      account.tokenExpiry = expiresAt;
      await this.youtubeAccountRepo.updateAsync(account);

      return { accessToken: access_token, expiresAt };
    } catch (error) {
      logger.error('[OAuthService] YouTube token refresh failed', error);
      throw new PublishAuthError('Failed to refresh YouTube access token');
    }
  }
}
