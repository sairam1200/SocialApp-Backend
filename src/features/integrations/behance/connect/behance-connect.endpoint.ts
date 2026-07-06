import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import configs from '../../../../configs';
import { stringUtil } from '../../../../core/utils/string.util';
import { getRedirectUrl } from '../../../../core/utils/redirectUrl.util';
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
import { BehanceProfileModel } from '../../../../domain/contracts/behance.model';
import {
  BehanceConnectCallbackQuery,
  BehanceConnectQuery,
} from '../../behance/connect/behance-connect.handler';

class BehanceConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: BehanceProfileModel;
}

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/behance`,
  version: '1',
})
export class BehanceConnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    const scopes = ['activity_read'].join(' ');
    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.behance.clientId,
      redirect_uri: getRedirectUrl(configs.behance.redirectUri),
      scope: scopes,
      state,
    });

    const authorizeURL = `https://www.behance.net/v2/oauth/authenticate?${params.toString()}`;

    await this.commandBus.execute(
      new BehanceConnectQuery({ model: { state } }),
    );
    return res.status(HttpStatus.OK).json({ authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: BehanceConnectCallbackResponseModel,
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
      new BehanceConnectCallbackQuery({ model: { code, state } }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
