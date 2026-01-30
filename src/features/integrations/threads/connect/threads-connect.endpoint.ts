import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { stringUtil } from "../../../../core/utils/string.util";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { ThreadsProfileModel } from "../../../../domain/contracts/threads.model";
import { ThreadsConnectCallbackQuery, ThreadsConnectQuery } from "../../threads/connect/threads-connect.handler";

class ThreadsConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: ThreadsProfileModel;
}

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/threads`,
  version: '1',
})
export class ThreadsConnectController {

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 302, description: 'FOUND', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    // Note: Threads API not yet available - placeholder implementation
    // When Meta releases Threads API, update this with actual OAuth flow
    const scopes = [
      'threads_basic',
      'threads_content_publish',
      'threads_read'
    ].join(',');
    
    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.threads?.clientId || '',
      redirect_uri: configs.threads?.redirectUri || '',
      scope: scopes,
      state: state,
    });
    
    // Placeholder URL - will be updated when Threads API is available
    const authorizeURL = `https://www.threads.net/oauth/authorize?${params.toString()}`;

    await this.commandBus.execute(new ThreadsConnectQuery({ model: { state } }));
    return res.status(HttpStatus.FOUND).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: ThreadsConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new ThreadsConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}
