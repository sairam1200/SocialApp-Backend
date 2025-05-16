import { Response } from "express";
import querystring from 'querystring';
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { stringUtil } from "../../../../core/utils/string.util";
import { SpotifyConnectCommand } from "./spotify-connect.handler";
import { PermissionsGuard } from "../../../../core/passport/permissions.guard";
import { Body, Controller, Get, HttpRedirectResponse, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
// @UseGuards(PermissionsGuard)
@Controller({
  path: `/integrations/spotify`,
  version: '1',
})
export class SpotifyConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @ApiResponse({ status: 302, description: 'FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<void> {

    const scopes = [
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-read-currently-playing',
      'user-read-recently-played',
      'user-read-playback-position',
      'user-top-read',
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-follow-read'
    ].join(',');

    const authorizeURL = `https://accounts.spotify.com/authorize/` + querystring.stringify({
      response_type: 'code',
      client_id: configs.pinterest.clientId,
      redirect_uri: configs.pinterest.redirectUri,
      scope: scopes,
      state: stringUtil.generateRandomString(16),
    });

    res.status(HttpStatus.FOUND).redirect(authorizeURL);
  }

  @Get('callback')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Res() res: Response): Promise<Response | void> {
    if (!code) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid request' });
    }

    const result = await this.commandBus.execute(new SpotifyConnectCommand({ model: { code } }));
    return res.status(HttpStatus.OK).json(result);
  }
}