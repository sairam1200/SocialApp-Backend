import axios from 'axios';
import { Queue } from 'bull';
import configs from '../../../../configs';
import { InjectQueue } from '@nestjs/bull';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserLogin } from '../../../../domain/entities/userLogin.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

export class FacebookImportRequestModel {
  @ApiProperty()
  facebookAccessToken: string;
}

export class FacebookImportCommand {
  model: FacebookImportRequestModel;

  constructor(request: Partial<FacebookImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(FacebookImportCommand)
export class FacebookImportCommandHandler
  implements ICommandHandler<FacebookImportCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.FACEBOOK_IMPORT)
    private readonly importQueue: Queue,
  ) {}

  public async execute(
    command: FacebookImportCommand,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    let expiresIn: number;
    const now = new Date();
    const { facebookAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (facebookAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(facebookAccessToken);
      if (isTokenValid) {
        // Use the provided token
        accessToken = facebookAccessToken;
      } else {
        const userLogin = await this.getUserLoginAsync(userId);
        const { access_token, expires_in } = await this.refreshTokenAsync(
          userLogin.tokenValue,
        );

        accessToken = access_token;
        expiresIn = expires_in;
      }
    } else {
      // No token provided → use stored login
      const userLogin = await this.getUserLoginAsync(userId);
      const { access_token, expires_in } = await this.refreshTokenAsync(
        userLogin.tokenValue,
      );
      accessToken = access_token;
      expiresIn = expires_in;
    }

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.FACEBOOK,
        userId,
      );
    if (!account) {
      throw new NotFoundException('No matching Facebook profile was found!');
    }

    try {
      await this.importQueue.add(
        'FACEBOOK_IMPORT',
        { account, accessToken },
        {
          attempts: 3,
          backoff: 5000,
        },
      );
    } catch (error) {
      logger.error(
        `An error occurred while adding the Facebook import job to the queue: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
      throw new ApplicationException(
        'Failed to initiate Facebook import. Please try again later.',
      );
    }

    return {
      accessToken,
      expiresIn,
    };
  }

  private async refreshTokenAsync(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    try {
      const response = await axios.get(
        'https://graph.facebook.com/v23.0/oauth/access_token',
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: configs.facebook.clientId,
            client_secret: configs.facebook.clientSecret,
            fb_exchange_token: refreshToken,
          },
        },
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException(
          'Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.',
        );
      }

      return {
        access_token,
        expires_in,
      };
    } catch (error) {
      logger.error(
        `An error occurred while processing the Facebook import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );

      throw new UnauthorizedException(
        'Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.',
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const appAccessToken = `${configs.facebook.clientId}|${configs.facebook.clientSecret}`;

      const response = await axios.get(
        `https://graph.facebook.com/v23.0/debug_token`,
        {
          params: {
            input_token: accessToken,
            access_token: appAccessToken,
          },
        },
      );

      const data = response.data.data;
      return data.is_valid;
    } catch (error) {
      logger.error(
        `An error occurred while processing the Facebook import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );

      return false;
      // throw new ApplicationException("Something went wrong while verifying the Facebook access token. Please try again later.");
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    const now = new Date();

    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.FACEBOOK,
      );

    if (!userLogin) {
      throw new ApplicationException(
        'No Facebook account linked to your user profile. Please link your Facebook account to proceed.',
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new ApplicationException(
        'Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.',
      );
    }

    return userLogin;
  }
}