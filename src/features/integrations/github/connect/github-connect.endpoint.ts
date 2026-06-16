import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { cryptoUtils } from "../../../../core/utils/crypto.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { GithubConnectQuery, GithubConnectCallbackQuery } from "./github-connect.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/github`,
  version: '1',
})
export class GithubConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

    const scopes = [
      'read:user',
      'user:email',
      'repo',
    ].join(' ');

    const state = cryptoUtils.generateEncryptionKey(16);

    const params = new URLSearchParams({
      client_id: configs.github.clientId,
      redirect_uri: configs.github.redirectUri,
      scope: scopes,
      state: state,
    });
    const authorizeURL = `https://github.com/login/oauth/authorize?${params.toString()}`;

    await this.commandBus.execute(new GithubConnectQuery({ model: { state } }));
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new GithubConnectCallbackQuery({
      model: { code, state }
    }));
    return res.status(HttpStatus.OK).json(result);
  }
}
