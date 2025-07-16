import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { stringUtil } from "../../../../core/utils/string.util";
import { ApiProperty, ApiTags, ApiResponse, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { Controller, Get, HttpStatus, Query, Req, Res, UseGuards } from "@nestjs/common";
import { TikTokConnectCallbackQuery, TikTokConnectQuery } from "./tiktok-connect.handler";
import * as crypto from 'crypto';

class ConnectResponseModel {
  @ApiProperty({
    description: 'TikTok OAuth authorization URL with PKCE support',
    example: 'https://www.tiktok.com/v2/auth/authorize/?response_type=code&client_key=...&redirect_uri=...&scope=user.info.basic,user.info.profile,user.info.stats,video.list&state=...&code_challenge_method=S256&code_challenge=...'
  })
  authorizeURL: string;
}

class TikTokUserProfile {
  @ApiProperty({ description: 'User ID on TikTok platform', example: 'user123' })
  userId: string;
  
  @ApiProperty({ description: 'Platform identifier', example: 'tiktok' })
  platform: string;
  
  @ApiProperty({ description: 'Username on TikTok', example: 'john_doe' })
  userName: string;
  
  @ApiProperty({ description: 'External user ID from TikTok', example: 'tiktok_12345' })
  externalId: string;
  
  @ApiProperty({ description: 'Whether import is allowed', example: true })
  allowImport: boolean;
  
  @ApiProperty({ 
    description: 'User metadata from TikTok',
    example: { likesCount: 100, videoCount: 50 }
  })
  metaData: {
    likesCount: number;
    videoCount: number;
  };
}

class TikTokConnectCallbackResponseModel {
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
    type: TikTokUserProfile
  })
  profile: TikTokUserProfile;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TikTokConnectController {
  constructor(private readonly commandBus: CommandBus) { }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND', type: ConnectResponseModel })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    const scopes = [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list'
    ].join(',');

    const state = stringUtil.generateRandomString(16);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_key: configs.tiktok.clientId,
      redirect_uri: configs.tiktok.redirectUri,
      scope: scopes,
      state: state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    const authorizeURL = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

    await this.commandBus.execute(new TikTokConnectQuery({ model: { state, codeVerifier } }));
    return res.status(HttpStatus.FOUND).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: TikTokConnectCallbackResponseModel })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new TikTokConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}
