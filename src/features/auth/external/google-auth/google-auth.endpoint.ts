import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import configs from '../../../../configs';
import { ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { stringUtil } from '../../../../core/utils/string.util';
import { getRedirectUrl } from '../../../../core/utils/redirectUrl.util';
import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import {
  GoogleCallbaclTokenResponseModel,
  GoogleConnectCallbackQuery,
  GoogleConnectQuery,
} from './google-auth.handler';

class ConnectResponseModel {

  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Authentication')
@Controller({
  path: `/auth/google`,
  version: '1',
})
export class GoogleAuthenticationController {
  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'deviceId', type: String, required: true })
  @ApiQuery({ name: 'userAgent', type: String, required: true })
  @ApiQuery({ name: 'ipAddress', type: String, required: true })
  public async Connect(
    @Res() res: Response,
    @Query('deviceId') deviceId: string,
    @Query('userAgent') userAgent: string,
    @Query('ipAddress') ipAddress: string,
  ): Promise<Response | void> {

    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.youtube.clientId,
      redirect_uri: getRedirectUrl(configs.google.callbackUrl),
      scope: scopes,
      state: state,
      provider: 'google',
      access_type: 'offline',
      prompt: 'consent',
    });
    const authorizeURL = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    await this.commandBus.execute(
      new GoogleConnectQuery({
        model: { state, deviceId, userAgent, ipAddress },
      }),
    );
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: GoogleCallbaclTokenResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'code', type: String })
  @ApiQuery({ name: 'state', type: String })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new GoogleConnectCallbackQuery({
        model: { code, state },
      }),
    );

    return res.status(HttpStatus.OK).json(result);
  }
}
