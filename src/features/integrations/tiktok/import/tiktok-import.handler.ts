import axios from 'axios';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { UserLogin } from '../../../../domain/entities';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { deserializeObject, serializeObject } from '../../../../core/utils/serialization.util';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { TiktokImportEvent } from '../../../../domain/events';

const TIKTOK_BASE = 'https://open.tiktokapis.com/v2';

export class TiktokImportRequestModel {
  @ApiProperty()
  tiktokAccessToken: string;
}


export class TiktokImportCommand {
  model: TiktokImportRequestModel;

  constructor(request: Partial<TiktokImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TiktokImportCommand)
export class TiktokImportCommandHandler implements ICommandHandler<TiktokImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: TiktokImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    const { model } = command;
    let expiresIn: number;
    let accessToken: string | undefined;
    const { tiktokAccessToken } = command.model;
    const userId = HttpContext.getCurrentUserId;

    if (tiktokAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(tiktokAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        const tokenValue = deserializeObject<{ access_token: string, expires_in: number, refresh_token: string }>(userLogin.tokenValue)
        const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
        if (!isTokenValid) {
          const {
            access_token,
            expires_in,
            refresh_token,
            refresh_expires_in,
          } = await this.refreshTokenAsync(tokenValue.refresh_token);

          userLogin.tokenValue = serializeObject({
            access_token,
            expires_in,
            refresh_token
          });
          userLogin.expiryDateUtc = new Date(Date.now() + refresh_expires_in * 1000)
          this.userLoginRepository.updateAsync(userLogin);

          accessToken = access_token;
          expiresIn = expires_in;
        } else {
          accessToken = tokenValue.access_token;
          expiresIn = tokenValue.expires_in;
        }

      } else {
        accessToken = tiktokAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const tokenValue = deserializeObject<{ access_token: string, expires_in: number, refresh_token: string }>(userLogin.tokenValue)
      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
      if (!isTokenValid) {
        const {
          access_token,
          expires_in,
          refresh_token,
          refresh_expires_in,
        } = await this.refreshTokenAsync(tokenValue.refresh_token);

        userLogin.tokenValue = serializeObject({
          access_token,
          expires_in,
          refresh_token
        });
        userLogin.expiryDateUtc = new Date(Date.now() + refresh_expires_in * 1000)
        this.userLoginRepository.updateAsync(userLogin);

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = tokenValue.expires_in;
      }
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TIKTOK, userId);
    if (!account) {
      throw new NotFoundException("No matching TikTok profile was found!");
    }

    account.allowImport = true;
    await this.linkedAccountRepository.updateAsync(account);

    try {
      this.eventEmitter.emit('tiktok.import', new TiktokImportEvent({ account, accessToken }));
      logger.info(`[TiktokImport] Import event emitted for user ${userId}`);
    } catch (error) {
      logger.error(`An error occurred while emitting the TikTok import event: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to initiate TikTok import. Please try again later.');
    }

    return {
      accessToken,
      expiresIn
    }
  }

  private async refreshTokenAsync(refreshToken: string): Promise<{ access_token: string, expires_in: number, refresh_token?: string, refresh_expires_in?: number }> {
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
      logger.error(`An error occurred while processing the Tiktok import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      throw new UnauthorizedException(
        'No Tiktok account linked to your user profile. Please re-link your Tiktok account to proceed.'
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`${TIKTOK_BASE}/v2/user/info/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          fields: 'open_id',
        },
      });

      const isValid = response.status === 200 && !!response.data?.data?.user?.open_id;
      return isValid;
    } catch (error: any) {
      logger.error('TikTok token verification failed in import handler', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.TIKTOK
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Tiktok account linked to your user profile. Please link your Tiktok account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Tiktok session has expired or the access token is invalid. Please log in to Tiktok again to continue.'
      );
    }

    return userLogin;
  }

}
