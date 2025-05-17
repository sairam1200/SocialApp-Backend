import { Response } from "express";
import querystring from 'querystring';
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { PermissionsGuard } from "../../../../core/passport/permissions.guard";
import { InstagramConnectCallbackQuery, InstagramConnectQuery } from "./instagram-connect.handler";
import { Body, Controller, Get, HttpRedirectResponse, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
// @UseGuards(PermissionsGuard)
@Controller({
  path: `/integrations/instagram`,
  version: '1',
})
export class InstagramConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<void> {

    const scopes = [
      'user_profile',
      'user_media'
    ].join(',');

    const state = stringUtil.generateRandomString(16);
    const authorizeURL = `https://api.instagram.com/oauth/authorize?` + querystring.stringify({
      response_type: 'code',
      client_id: configs.Instagram.clientId,
      redirect_uri: configs.Instagram.redirectUri,
      scope: scopes,
      state: state,
      show_dialog: true, // Always show the login page
    });

    await this.commandBus.execute(new InstagramConnectQuery({ model: { state } }));
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
    @Res() res: Response): Promise<Response | void> {
    if (!code) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid request' });
    }

    const result = await this.commandBus.execute(new InstagramConnectCallbackQuery({ model: { code, state } }));
    res.cookie('instagram_auth', {
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