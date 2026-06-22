import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { YoutubeConnectCallbackQuery, YoutubeConnectQuery } from "./youtube-connect.handler";
import { YoutubeProfileModel } from "../../../../domain/contracts/youtube.model";
import { getRedirectUrl } from "core/utils/redirectUrl.util";
import { HttpContext } from "core/middlewares/httpContext.middleware";

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

class YoutubeConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: YoutubeProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ].join(' ');

    const state = stringUtil.generateRandomString(16);
    console.log(
      "configs.youtube.callbackUrl:",
      configs.youtube.callbackUrl
    );

    console.log(
      "headers:",
      HttpContext.headers
    );
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.youtube.clientId,
      redirect_uri: getRedirectUrl(configs.youtube.callbackUrl),
      scope: scopes,
      state: state,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    console.log(
      "configs.youtube.callbackUrl:",
      configs.youtube.callbackUrl
    );

    console.log(
      "getRedirectUrl result:",
      getRedirectUrl(
        configs.youtube.callbackUrl
      )
    );
    const authorizeURL = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    await this.commandBus.execute(new YoutubeConnectQuery({ model: { state } }));
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: YoutubeConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response): Promise<Response | void> {

    const result = await this.commandBus.execute(new YoutubeConnectCallbackQuery({
      model: { code, state }
    }));

    return res.status(HttpStatus.OK).json(result);
  }
}