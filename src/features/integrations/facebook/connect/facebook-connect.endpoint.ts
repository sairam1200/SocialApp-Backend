import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { stringUtil } from "../../../../core/utils/string.util";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { FacebookProfileModel } from "../../../../domain/contracts/facebook.model";
import { Controller, Get, HttpStatus, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FacebookConnectCallbackQuery, FacebookConnectQuery } from "./facebook-connect.handler";

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

class FacebookConnectCallbackResponseModel {
  @ApiProperty({ description: "Access token from facebook" })
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: FacebookProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/facebook`,
  version: '1',
})
export class FacebookConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 302, description: 'FOUND', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

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
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.facebook.clientId,
      redirect_uri: configs.facebook.redirectUri,
      scope: scopes,
      state: state,
      show_dialog: 'true', // Always show the login page
    });

    const authorizeURL = `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;

    await this.commandBus.execute(new FacebookConnectQuery({ model: { state } }));
    return res.status(HttpStatus.FOUND).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: FacebookConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new FacebookConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}