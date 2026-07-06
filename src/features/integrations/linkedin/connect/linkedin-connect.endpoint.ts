import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import configs from '../../../../configs';
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
import { LinkedInProfileModel } from '../../../../domain/contracts/linkedin.model';
import {
  LinkedInConnectCallbackQuery,
  LinkedInConnectQuery,
} from './linkedin-connect.handler';

class ConnectResponseModel {
  @ApiProperty()
  authorizeURL: string;
}

class LinkedInConnectCallbackResponseModel {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  expiresIn: string;
  @ApiProperty()
  profile: LinkedInProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/linkedin`,
  version: '1',
})
export class LinkedInConnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(): Promise<ConnectResponseModel> {
    const scopes = [
      'openid',
      'profile',
      'email',
      'r_organization_admin',
      'r_organization_social',
      'w_member_social',
    ].join(' ');

    const state = stringUtil.generateRandomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: configs.linkedin.clientId,
      redirect_uri: configs.linkedin.redirectUri,
      state,
      scope: scopes,
    });

    const authorizeURL = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

    await this.commandBus.execute(
      new LinkedInConnectQuery({
        model: { state },
      }),
    );

    return {
      authorizeURL,
    };
  }

  @Get('connect-callback')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: LinkedInConnectCallbackResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query() query: any,
  ): Promise<LinkedInConnectCallbackResponseModel> {
    const result = await this.commandBus.execute(
      new LinkedInConnectCallbackQuery({
        model: {
          code: query.code,
          state: query.state,
        },
      }),
    );

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn.toString(),
      profile: result.profile,
    };
  }
}
