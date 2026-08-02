import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import configs from '../../../../configs';
import logger from '../../../../core/utils/winston.util';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { stringUtil } from '../../../../core/utils/string.util';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  RedditConnectQuery,
  RedditConnectCallbackQuery,
} from './reddit-connect.handler';

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/reddit`,
  version: '1',
})
export class RedditConnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    const state = stringUtil.generateRandomString(16);

    const params = new URLSearchParams({
      client_id: configs.reddit.clientId,
      response_type: 'code',
      state,
      redirect_uri: configs.reddit.redirectUri,
      duration: 'permanent',
      scope: 'identity history read submit save',
    });

    const authorizeURL = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;

    logger.debug('[RedditConnect] Initiating OAuth flow');

    await this.commandBus.execute(new RedditConnectQuery({ model: { state } }));

    return res.status(HttpStatus.OK).json({ authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    logger.debug('[RedditConnect] Callback received');

    const result = await this.commandBus.execute(
      new RedditConnectCallbackQuery({ model: { code, state } }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
