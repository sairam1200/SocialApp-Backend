import { Response } from "express";
import querystring from 'querystring';
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { cryptoUtils } from "../../../../core/utils/crypto.utils";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { TwitterConnectCallbackQuery, TwitterConnectQuery } from "./twitter-connect.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/twitter`,
  version: '1',
})
export class TwitterConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<void> {

    const scopes = [
      'tweet.read',
      'users.read',
      'offline.access',
    ].join(' ');

    const state = cryptoUtils.generateEncryptionKey(16);
    const codeVerifier = cryptoUtils.generateEncryptionKey();
    const challenge = cryptoUtils.encodeSHA256ToBase64(codeVerifier);

    const authorizeURL = `https://twitter.com/i/oauth2/authorize?` + querystring.stringify({
      response_type: 'code',
      client_id: configs.twitter.clientId,
      redirect_uri: configs.twitter.redirectUri,
      scope: scopes,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    await this.commandBus.execute(new TwitterConnectQuery({ model: { state, codeVerifier } }));
    res.status(HttpStatus.FOUND).redirect(authorizeURL);
  }

  @Get('connect-callback')
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

    const result = await this.commandBus.execute(new TwitterConnectCallbackQuery({
      model: { code, state }
    }));
    return res.status(HttpStatus.OK).json(result);
  }
}