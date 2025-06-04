import axios from "axios";
import * as qs from "qs";
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

export class RedditImportRequestModel {
  @ApiProperty()
  redditAccessToken: string;
}

export class RedditImportCommand {
  model: RedditImportRequestModel;

  constructor(request: Partial<RedditImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(RedditImportCommand)
export class RedditImportCommandHandler implements ICommandHandler<RedditImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.PINTEREST_IMPORT)
    private readonly importQueue: Queue
  ) {}

  public async execute(command: RedditImportCommand): Promise<{ accessToken: string, expiresIn: number }> {
    const { redditAccessToken } = command.model;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (!redditAccessToken) {
      throw new UnauthorizedException("Reddit access token is required.");
    }

    logger.info(`Starting Reddit import for user ${userId}`);

    await this.importQueue.add("reddit-import-job", {
      userId,
      accessToken: redditAccessToken
    });

    return {
      accessToken: redditAccessToken,
      expiresIn: 3600
    };
  }
}
