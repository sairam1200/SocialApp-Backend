import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ProblemDocument } from "http-problem-details";
import { cryptoUtils } from "../../../../core/utils/crypto.util";
import { ApiProperty, ApiTags, ApiResponse } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { TiktokProfileModel } from "../../../../domain/contracts/tiktok.model";
import { Controller, Get, HttpStatus, Query, Req, Res, UseGuards } from "@nestjs/common";
import { TiktokConnectCallbackQuery, TikTokConnectQuery } from "./tiktok-connect.handler";

class TikTokConnectResponseModel {
  @ApiProperty({
    description: 'TikTok OAuth authorization URL with PKCE support',
  })
  authorizeURL: string;
}

export class TikTokConnectCallbackResponseModel {
  @ApiProperty({
    description: 'Access token from TikTok (short-lived)',
    example: 'act.1234567890abcdef...'
  })
  accessToken: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: '3600'
  })
  expiresIn: string;

  @ApiProperty({
    description: 'User profile data from TikTok',
    type: TiktokProfileModel
  })
  profile: TiktokProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TiktokConnectController {
  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: TikTokConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', type: ProblemDocument })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST', type: ProblemDocument })
  @ApiResponse({ status: 403, description: 'FORBIDDEN', type: ProblemDocument })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    const scopes = [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
    ].join(',');

    const state = cryptoUtils.generateEncryptionKey(16);
    const codeVerifier = cryptoUtils.generateEncryptionKey();
    const challenge = cryptoUtils.encodeSHA256ToBase64(codeVerifier);
    console.log(configs.tiktok.clientId, configs.tiktok.redirectUri)
    const params = new URLSearchParams({
      response_type: 'code',
      client_key: configs.tiktok.clientId,
      redirect_uri: configs.tiktok.redirectUri,
      scope: scopes,
      state: state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });

    const authorizeURL = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

    await this.commandBus.execute(new TikTokConnectQuery({ model: { state, codeVerifier } }));
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: TikTokConnectCallbackResponseModel })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new TiktokConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}
