import axios from "axios";
import * as qs from 'qs';
import { Queue } from "bull";
import configs from "../../../../configs";
import { InjectQueue } from "@nestjs/bull";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserLogin } from "../../../../domain/entities/userLogin.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

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
    @InjectQueue(_const.BULL_QUEUES.PINTEREST_IMPORT)
    private readonly importQueue: Queue
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
          this.userLoginRepository.updateAsync(userLogin);
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

    this.importQueue.add({ account, accessToken }, {
      attempts: 3,
      backoff: 5000
    });

    return {
      accessToken,
      expiresIn
    }
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number, refresh_token: string, refresh_token_expires_in: number }> {

    try {

      const response = await axios.post('https://api.pinterest.com/v5/oauth/token',
        qs.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: configs.pinterest.clientId,
          client_secret: configs.pinterest.clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    const userLogin = await this.userLoginRepository.getByUserIdAndProvider(
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
        'Your Pinterest session has expired or the access token is invalid. Please log in to Pinterest again to continue.'
      );
    }

    return userLogin;
  }
}