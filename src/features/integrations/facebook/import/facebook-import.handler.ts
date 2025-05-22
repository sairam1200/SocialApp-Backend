import axios from "axios";
import { Queue } from "bull";
import configs from "../../../../configs";
import { InjectQueue } from "@nestjs/bull";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

export class FacebookImportCommand {

  constructor(request: Partial<FacebookImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(FacebookImportCommand)
export class FacebookImportCommandHandler implements ICommandHandler<FacebookImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.FACEBOOK_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(query: FacebookImportCommand): Promise<void> {

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const userLogin = await this.userLoginRepository.getByUserIdAndProvider(userId, _const.PLATFORMS.FACEBOOK);
    if (!userLogin) {
      throw new ApplicationException("No Facebook account linked to your user profile. Please link your Facebook account to proceed.");
    }

    // Facebook long lived token!
    const accessToken = userLogin.tokenValue;

    const isTokenValid = await this.verifyAccessToken(accessToken);
    if (!isTokenValid) {
      throw new ApplicationException('Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.');
      // ❌ Token is invalid or expired
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.FACEBOOK, userId);
    if (!account) {
      throw new NotFoundException("No matching Facebook profile was found!");
    }

    this.importQueue.add({ account, accessToken }, {
      attempts: 3,
      backoff: 5000
    });
  }

  private async verifyAccessToken(accessToken: string): Promise<boolean> {

    try {
      const appAccessToken = `${configs.facebook.clientId}|${configs.facebook.clientSecret}`;

      const response = await axios.get(`https://graph.facebook.com/v22.0/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: appAccessToken
        },
      });

      const data = response.data.data;
      return data.is_valid;
    } catch (error) {
      logger.error(`An error occurred while processing the Facebook import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      throw new ApplicationException("Something went wrong while verifying the Facebook access token. Please try again later.");
    }

  }
}