import { Response } from "express";
import querystring from 'querystring';
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FacebookConnectCallbackQuery, FacebookConnectQuery } from "./facebook-connect.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/facebook`,
  version: '1',
})
export class FacebookConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<void> {

    const scopes = [
      'email',
      'public_profile',
      'user_friends',
      'user_birthday',
      'user_gender',
      'user_hometown',
      'user_link',
      'user_location',
      'user_photos',
      'user_posts',
      'user_videos'
    ].join(',');

    const state = stringUtil.generateRandomString(16);
    const authorizeURL = `https://www.facebook.com/v22.0/dialog/oauth?` + querystring.stringify({
      response_type: 'code',
      client_id: configs.facebook.clientId,
      redirect_uri: configs.facebook.redirectUri,
      scope: scopes,
      state: state,
      show_dialog: true, // Always show the login page
    });

    await this.commandBus.execute(new FacebookConnectQuery({ model: { state } }));
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

    const result = await this.commandBus.execute(new FacebookConnectCallbackQuery({ model: { code, state } }));
    res.cookie('facebook_auth', {
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