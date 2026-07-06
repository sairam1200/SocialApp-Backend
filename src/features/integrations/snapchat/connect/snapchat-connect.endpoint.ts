import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import configs from '../../../../configs';
import { stringUtil } from '../../../../core/utils/string.util';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SnapchatProfileModel } from '../../../../domain/contracts/snapchat.model';
import {
  SnapchatConnectCallbackQuery,
  SnapchatConnectQuery,
} from '../../snapchat/connect/snapchat-connect.handler';

class SnapchatConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: SnapchatProfileModel;
}

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/snapchat`,
  version: '1',
})
export class SnapchatConnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    // Note: Snapchat Kit API has limited availability
    // This is a placeholder implementation that may need fallback logic
    const scopes = [
      'user.external_id',
      'user.display_name',
      'user.bitmoji.avatar',
    ].join(' ');

    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.snapchat?.clientId || '',
      redirect_uri: configs.snapchat?.redirectUri || '',
      scope: scopes,
      state: state,
    });

    // Placeholder URL, actual Snapchat Kit OAuth URL may differ
    const authorizeURL = `https://accounts.snapchat.com/login/oauth2/authorize?${params.toString()}`;

    await this.commandBus.execute(
      new SnapchatConnectQuery({ model: { state } }),
    );
    return res.status(HttpStatus.OK).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: SnapchatConnectCallbackResponseModel,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new SnapchatConnectCallbackQuery({ model: { code, state } }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
