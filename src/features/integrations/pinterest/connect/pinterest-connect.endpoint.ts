import { Response } from "express";
import querystring from 'querystring';
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { PinterestConnectCallbackQuery, PinterestConnectQuery } from "./pinterest-connect.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/pinterest`,
  version: '1',
})
export class PinterestConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<void> {

    const scopes = [
      'read_users',
      'read_pins',
      'write_pins',
      'read_boards',
      'write_boards',
      'read_board_groups'
    ].join(' ');

    const state = stringUtil.generateRandomString(16);
    const authorizeURL = `https://www.pinterest.com/oauth/` + querystring.stringify({
      response_type: 'code',
      client_id: configs.pinterest.clientId,
      redirect_uri: configs.pinterest.redirectUri,
      scope: scopes,
      state: state,
    });

    await this.commandBus.execute(new PinterestConnectQuery({ model: { state } }));

    res.status(HttpStatus.FOUND).redirect(authorizeURL);
  }

  @Get('callback')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new PinterestConnectCallbackQuery({ model: { code, state } }));
    res.cookie('pinterest_auth', {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    },
      {
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
      });
    return res.status(HttpStatus.OK).json(result.profile);
  }
}