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

export class SpotifyImportRequestModel {
  @ApiProperty()
  spotifyAccessToken: string;
}

export class SpotifyImportCommand {

  model: SpotifyImportRequestModel

  constructor(request: Partial<SpotifyImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SpotifyImportCommand)
export class SpotifyImportCommandHandler implements ICommandHandler<SpotifyImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.PINTEREST_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(command: SpotifyImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const { spotifyAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];


    return;
  }
}