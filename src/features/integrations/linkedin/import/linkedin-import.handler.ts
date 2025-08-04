import axios from "axios";
import * as Joi from "joi";
import { Queue } from "bull";
import { Inject } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { ApiProperty } from "@nestjs/swagger";
import { NotFoundException } from "@nestjs/common";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";

const PLATFORM = 'linkedin';
const API_BASE = 'https://api.linkedin.com/v2';

export class LinkedInImportRequestModel {
  @ApiProperty()
  linkedInAccessToken: string;
}

export class LinkedInImportCommand {
  model: LinkedInImportRequestModel;

  constructor(request: Partial<LinkedInImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(LinkedInImportCommand)
export class LinkedInImportCommandHandler implements ICommandHandler<LinkedInImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.LINKEDIN_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(command: LinkedInImportCommand): Promise<{ accessToken: string; expiresIn: number; }> {

    let expiresIn: number;
    const now = new Date();
    
    const linkedInAccessToken = command.model?.linkedInAccessToken;
    
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (linkedInAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(linkedInAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
      } else {
        accessToken = linkedInAccessToken;
        expiresIn = 5184000;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      accessToken = userLogin.tokenValue;
      expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.LINKEDIN, userId);
    if (!account) {
      throw new NotFoundException('No matching LinkedIn profile was found!');
    }

    try {
      await this.importQueue.add(_const.BULL_QUEUES.LINKEDIN_IMPORT, { account, accessToken }, {
        attempts: 3,
        backoff: 5000
      });
      console.log('LinkedIn import job added to the queue');
    } catch (error) {
      logger.error(`An error occurred while adding the LinkedIn import job to the queue: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to add LinkedIn import job to the queue. Please try again later.');
    }

    return {
      accessToken,
      expiresIn
    };
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`${API_BASE}/people/~:(id)`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return response.status === 200 && !!response.data?.id;
    } catch (error) {
      logger.error('LinkedIn token verification failed', error);
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<any> {
    const now = new Date();

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.LINKEDIN
    );

    if (!userLogin) {
      throw new ApplicationException(
        'No LinkedIn account linked to your user profile. Please link your LinkedIn account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new ApplicationException(
        'Your LinkedIn session has expired or the access token is invalid. Please log in to LinkedIn again to continue.'
      );
    }

    return userLogin;
  }
}
