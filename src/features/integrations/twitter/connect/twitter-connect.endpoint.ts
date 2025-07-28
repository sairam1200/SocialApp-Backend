import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { cryptoUtils } from "../../../../core/utils/crypto.util";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { TwitterConnectCallbackQuery, TwitterConnectQuery } from "./twitter-connect.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/twitter`,
  version: '1',
})
export class TwitterConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {

    const scopes = [
      'tweet.read',
      'users.read',
      'offline.access',
      'like.read',
     
      
    ].join(' ');

    const state = cryptoUtils.generateEncryptionKey(16);
    const codeVerifier = cryptoUtils.generateEncryptionKeyBase64url();
    const challenge = cryptoUtils.encodeSHA256ToBase64Url(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.twitter.clientId,
      redirect_uri: configs.twitter.redirectUri,
      scope: scopes,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    const authorizeURL = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

    await this.commandBus.execute(new TwitterConnectQuery({ model: { state, codeVerifier } }));
    return res.status(HttpStatus.FOUND).json({ authorizeURL: authorizeURL });
  }

  @Get('connect/callback')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new TwitterConnectCallbackQuery({
      model: { code, state }
    }));
    return res.status(HttpStatus.OK).json(result);
  }
}