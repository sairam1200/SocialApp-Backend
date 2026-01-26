import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { stringUtil } from "../../../../core/utils/string.util";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { PinterestProfileModel } from "../../../../domain/contracts/pinterest.model";
import { PinterestConnectCallbackQuery, PinterestConnectQuery } from "./pinterest-connect.handler";

class PinterestConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: PinterestProfileModel;
}

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/pinterest`,
  version: '1',
})
export class PinterestConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

    const scopes = [
      'user_accounts:read',
      'pins:read',
      'boards:read'
    ].join(' ');
    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.pinterest.clientId,
      redirect_uri: configs.pinterest.redirectUri,
      scope: scopes,
      state: state,
    });
    const authorizeURL = `https://www.pinterest.com/oauth/?${params.toString()}`;

    await this.commandBus.execute(new PinterestConnectQuery({ model: { state } }));

    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: PinterestConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new PinterestConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}