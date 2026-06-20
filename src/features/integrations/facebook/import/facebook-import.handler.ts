import axios from 'axios';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserLogin } from '../../../../domain/entities';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IQueueService } from '../../../../domain/services/iqueue.service';
import { IFacebookImportService } from "../../../../domain/services/facebook/ifacebook-import.services";
import { deserializeObject } from "../../../../core/utils/serialization.util";
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
  implements ICommandHandler<FacebookImportCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
    @Inject(_const.IFACEBOOK_IMPORT_SERVICE)
    private readonly facebookImportService: IFacebookImportService,
  ) { }

  public async execute(
  command: FacebookImportCommand,
): Promise<{ accessToken: string; expiresIn: number }> {

  let expiresIn: number;

  const { facebookAccessToken } = command.model;
  let accessToken: string | undefined;

  const userId =
    HttpContext.user[Globals.ClaimTypes.UserId];

  console.log("=================================");
  console.log("FACEBOOK IMPORT EXECUTE START");
  console.log("USER ID:", userId);
  console.log(
    "TOKEN PROVIDED:",
    !!facebookAccessToken,
  );
  console.log("=================================");

  if (facebookAccessToken) {

    const isTokenValid =
      await this.verifyAccessTokenAsync(
        facebookAccessToken,
      );

    console.log(
      "PROVIDED TOKEN VALID:",
      isTokenValid,
    );

    if (isTokenValid) {

      accessToken = facebookAccessToken;

    } else {

      const userLogin =
        await this.getUserLoginAsync(userId);

      console.log(
        "FACEBOOK TOKEN VALUE:",
        userLogin.tokenValue,
      );

      const {
        access_token,
        expires_in,
      } = await this.refreshTokenAsync(
        userLogin.tokenValue,
      );

      console.log(
        "REFRESHED TOKEN RESPONSE:",
        {
          access_token:
            access_token?.substring(0, 40) + "...",
          expires_in,
        },
      );

      userLogin.tokenValue = access_token;

      userLogin.expiryDateUtc = new Date(
        Date.now() + expires_in * 1000,
      );

      await this.userLoginRepository.updateAsync(
        userLogin,
      );

      accessToken = access_token;
      expiresIn = expires_in;
    }

  } else {

    const userLogin =
      await this.getUserLoginAsync(userId);

    console.log(
      "USER LOGIN FOUND:",
      {
        id: userLogin.id,
        expiryDateUtc:
          userLogin.expiryDateUtc,
      },
    );

    const tokenValue =
      deserializeObject<{
        access_token: string;
        expires_in: number;
      }>(userLogin.tokenValue);

    console.log(
      "DESERIALIZED TOKEN:",
      {
        access_token:
          tokenValue?.access_token?.substring(
            0,
            40,
          ) + "...",
        expires_in:
          tokenValue?.expires_in,
      },
    );

    const isTokenValid =
      await this.verifyAccessTokenAsync(
        tokenValue.access_token,
      );

    console.log(
      "STORED TOKEN VALID:",
      isTokenValid,
    );

    if (!isTokenValid) {
      throw new UnauthorizedException(
        "Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.",
      );
    }

    accessToken = tokenValue.access_token;
    expiresIn = tokenValue.expires_in;
  }

  console.log(
    "FINAL TOKEN:",
    accessToken?.substring(0, 40) + "...",
  );

  console.log(
    "FINAL EXPIRES IN:",
    expiresIn,
  );
 
  const account =
    await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.FACEBOOK,
      userId,
    );
console.log(
  "ACCOUNT LOOKUP RESULT:",
  JSON.stringify(
    account,
    null,
    2,
  ),
);
  if (!account) {
    throw new NotFoundException(
      "No matching Facebook profile was found!",
    );
  }

  console.log(
    "LINKED ACCOUNT:",
    {
      id: account.id,
      facebookId: account.externalId,
      userName: account.userName,
      allowImport: account.allowImport,
    },
  );

  try {

    console.log(
      "CALLING FACEBOOK IMPORT SERVICE...",accessToken,
    );

    const pageAccessToken =
  account.metaData?.pageAccessToken;

if (!pageAccessToken) {
  throw new ApplicationException(
    "Facebook Page access token not found."
  );
}

await this.facebookImportService.importPagePostsAsync(
  userId,
  accessToken,
  pageAccessToken,
  account.externalId,
);
    
  } catch (error: any) {

    console.error(
      "FACEBOOK IMPORT ERROR:",
      error.response?.data ||
      error.message ||
      error,
    );

    logger.error(
      `[FacebookImport] Failed importing page posts`,
      error,
    );
  }

  try {

    console.log(
      "ENQUEUING FACEBOOK IMPORT JOB...",
    );

    await this.queueService.enqueueFacebookImport(
      account,
      accessToken,
    );

    logger.info(
      `[FacebookImport] Import job enqueued for user ${userId}`,
    );

  } catch (error) {

    logger.error(
      `An error occurred while enqueuing the Facebook import job:
      ${
        error instanceof Error
          ? error.message
          : JSON.stringify(error)
      }`,
      { error },
    );

    throw new ApplicationException(
      "Failed to initiate Facebook import. Please try again later.",
    );
  }

  console.log("FACEBOOK IMPORT EXECUTE COMPLETE");

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
private async getPageAccessTokenAsync(
  userAccessToken: string,
  pageId: string,
): Promise<string> {
  try {
    const response = await axios.get(
      'https://graph.facebook.com/v23.0/me/accounts',
      {
        params: {
          access_token: userAccessToken,
        },
      },
    );

    const page = response.data.data.find(
      (p: any) => p.id === pageId,
    );

    if (!page?.access_token) {
      throw new Error(
        `No access token found for page ${pageId}`,
      );
    }

    return page.access_token;
  } catch (error) {
    logger.error(
      `Failed to get page access token: ${
        error instanceof Error
          ? error.message
          : JSON.stringify(error)
      }`,
    );

    throw new UnauthorizedException(
      'Unable to access the Facebook Page. Please reconnect your Facebook account.',
    );
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
        'RECONNECT_REQUIRED',
      );
    }

    return userLogin;
  }
}
