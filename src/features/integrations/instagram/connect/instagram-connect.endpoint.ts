import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { InstagramProfileModel } from "../../../../domain/contracts/instagram.model";
import { InstagramConnectCallbackQuery, InstagramConnectQuery } from "./instagram-connect.handler";

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

class InstagramConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: InstagramProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/instagram`,
  version: '1',
})
export class InstagramConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

    const scopes = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
].join(",");
const state = stringUtil.generateRandomString(16);
const params = new URLSearchParams({
  force_reauth: "true",
  client_id: configs.Instagram.clientId,
  redirect_uri: configs.Instagram.redirectUri,
  response_type: "code",
  scope: scopes,
  state,
});

const authorizeURL =
  `https://www.instagram.com/oauth/authorize?${params.toString()}`;

    await this.commandBus.execute(new InstagramConnectQuery({ model: { state } }));
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: InstagramConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response): Promise<Response | void> {

    const result = await this.commandBus.execute(new InstagramConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}