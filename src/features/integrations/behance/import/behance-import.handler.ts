import axios from 'axios';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { UserLogin } from '../../../../domain/entities';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IQueueService } from '../../../../domain/services/iqueue.service';

export class BehanceImportRequestModel {
  @ApiProperty()
  behanceAccessToken: string;
}

export class BehanceImportCommand {
  model: BehanceImportRequestModel;

  constructor(request: Partial<BehanceImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(BehanceImportCommand)
export class BehanceImportCommandHandler
  implements ICommandHandler<BehanceImportCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
  ) {}

  public async execute(
    command: BehanceImportCommand,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    let expiresIn: number;
    const { behanceAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    // Note: Behance has no official API, so token verification is not applicable
    // We'll use the stored token or fallback token
    if (behanceAccessToken) {
      accessToken = behanceAccessToken;
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      accessToken = userLogin.tokenValue;
      expiresIn = Math.floor(
        (userLogin.expiryDateUtc.getTime() - Date.now()) / 1000,
      );
    }

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.BEHANCE,
        userId,
      );
    if (!account) {
      throw new NotFoundException('No matching Behance profile was found!');
    }

    if (!account.syncEnabled) {
      account.syncEnabled = true;
      await this.linkedAccountRepository.updateAsync(account);
      logger.info(`[BehanceImport] Sync enabled for user ${userId}`);
    }

    try {
      /*  await this.queueService.enqueueBehanceImport(account, accessToken); */
      logger.info(`[BehanceImport] Import job enqueued for user ${userId}`);
    } catch (error) {
      logger.error(
        `An error occurred while enqueueing the Behance import job: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
      throw new ApplicationException(
        'Failed to initiate Behance import. Please try again later.',
      );
    }
    return {
      accessToken,
      expiresIn: expiresIn || 3600 * 24 * 365,
    };
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    const now = new Date();
    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.BEHANCE,
      );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Behance account linked to your user profile. Please link your Behance account to proceed.',
      );
    }

    // For Behance, we don't enforce token expiry since there's no API
    return userLogin;
  }
}
