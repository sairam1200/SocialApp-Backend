import axios from "axios";
import * as qs from 'qs';
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { UserLogin } from "../../../../domain/entities";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IQueueService } from "../../../../domain/services/iqueue.service";
import { IPinterestImportService } from "domain/services/pinterest/ipinterest-import.service";
export class PinterestImportRequestModel {
  @ApiProperty()
  pinterestAccessToken: string;
}

export class PinterestImportCommand {

  model: PinterestImportRequestModel

  constructor(request: Partial<PinterestImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(PinterestImportCommand)
export class PinterestImportCommandHandler implements ICommandHandler<PinterestImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
    @Inject(_const.IPINTEREST_IMPORT_SERVICE)
    private readonly pinterestImportService: IPinterestImportService,
  ) { }

  public async execute(command: PinterestImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const { pinterestAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (pinterestAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(pinterestAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        const {
          access_token,
          expires_in,
          refresh_token,
          refresh_token_expires_in
        } = await this.refreshTokenAsync(userLogin.tokenValue);

        if (refresh_token) {
          userLogin.tokenValue = refresh_token;
          userLogin.expiryDateUtc = new Date(Date.now() + refresh_token_expires_in * 1000);
          await this.userLoginRepository.updateAsync(userLogin);
        }

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = pinterestAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);

      accessToken = access_token;
      expiresIn = expires_in;
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.PINTEREST, userId);
    if (!account) {
      throw new NotFoundException("No matching Pinterest profile was found!");
    }

    if (!account.syncEnabled) {
      account.syncEnabled = true;
      await this.linkedAccountRepository.updateAsync(account);
      console.log(`[PinterestImport] Sync enabled for user ${userId}`);
    }

    try {
      console.log("[PinterestImport] Starting import");

      await this.pinterestImportService.importPinsAsync(
        userId,
        accessToken,
        account.externalId,
      );

    } catch (error) {
      logger.error("Pinterest import failed", error);

      throw new ApplicationException(
        'Failed to import Pinterest pins.'
      );
    }

    try {
      await this.pinterestImportService.refreshProfileAsync(
        userId,
        accessToken,
        account.externalId,
      );
    } catch (error) {
      logger.error("Pinterest profile refresh failed", error);
    }
    return {
      accessToken,
      expiresIn
    }
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number, refresh_token: string, refresh_token_expires_in: number }> {

    const basicAuth = Buffer.from(`${configs.pinterest.clientId}:${configs.pinterest.clientSecret}`).toString('base64');

    try {
      const response = await axios.post(
        'https://api.pinterest.com/v5/oauth/token',
        `grant_type=refresh_token` +
        `&refresh_token=${encodeURIComponent(refreshToken)}`
        ,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          },
        },
      );
      const { access_token, expires_in, refresh_token, refresh_token_expires_in } = response.data;

      return {
        access_token,
        expires_in,
        refresh_token,
        refresh_token_expires_in
      };

    } catch (error) {
      console.log(error)
      logger.error(`An error occurred while processing the Pinterest import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      throw new UnauthorizedException(
        'No Pinterest account linked to your user profile. Please re-link your Pinterest account to proceed.'
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const res = await axios.get('https://api.pinterest.com/v5/user_account', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!res.data?.username;
    } catch (error) {
      logger.error('Pinterest access token verification failed:', error.response?.data || error.message)
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.PINTEREST
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Pinterest account linked to your user profile. Please link your Pinterest account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'RECONNECT_REQUIRED'
      );
    }

    return userLogin;
  }
}