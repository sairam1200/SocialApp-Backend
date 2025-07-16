import axios from 'axios';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import configs from '../../../../configs';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserLogin } from '../../../../domain/entities/userLogin.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';

const TIKTOK_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokImportCommand {
  constructor(request: Partial<TikTokImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TikTokImportCommand)
export class TikTokImportCommandHandler implements ICommandHandler<TikTokImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.TIKTOK_IMPORT)
    private readonly tiktokImportQueue: Queue,
  ) { }

  public async execute(command: TikTokImportCommand): Promise<{ success: boolean; message: string }> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TIKTOK, userId);
    
    if (!linkedAccount) {
      throw new ApplicationException('TikTok account not linked');
    }

    if (!linkedAccount.allowImport) {
      throw new ApplicationException('Import not allowed for this TikTok account');
    }
    
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.TIKTOK);

    if (!userLogin) {
      throw new ApplicationException('No valid TikTok access token found. Please re-authenticate.');
    }

    let accessToken = userLogin.tokenValue;

    // Check if token is valid before using
    const isValid = await this.verifyAccessTokenAsync(accessToken);

    if (!isValid) {
      const tokenData = await this.refreshTokenAsync(userLogin.tokenValue);
      accessToken = tokenData.access_token;

      userLogin.tokenValue = tokenData.refresh_token || accessToken;
      userLogin.expiryDateUtc = new Date(Date.now() + (tokenData.refresh_token_expires_in || tokenData.expires_in) * 1000);
      await this.userLoginRepository.updateAsync(userLogin);
    }

    // Add job to import queue
    await this.tiktokImportQueue.add('import-tiktok-content', {
      userId,
      linkedAccountId: linkedAccount.id,
      platform: _const.PLATFORMS.TIKTOK
    });

    return {
      success: true,
      message: 'TikTok content import started successfully'
    };
  }

  private async refreshTokenAsync(refreshToken: string): Promise<{ access_token: string, expires_in: number, refresh_token?: string, refresh_token_expires_in?: number }> {
    try {
      const response = await axios.post(`${TIKTOK_BASE}/oauth/token/`, {
        client_key: configs.tiktok.clientId,
        client_secret: configs.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error refreshing TikTok token in import handler', error);
      throw new ApplicationException('Failed to refresh TikTok token. Please re-authenticate.');
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`${TIKTOK_BASE}/user/info/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      return response.status === 200 && !!response.data?.data?.user?.open_id;
    } catch (error) {
      logger.error('TikTok token verification failed in import handler', error);
      return false;
    }
  }
}
