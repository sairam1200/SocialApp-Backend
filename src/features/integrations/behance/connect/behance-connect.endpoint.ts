import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import configs from "../../../../configs";
import { stringUtil } from "../../../../core/utils/string.util";
import { ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { BehanceProfileModel } from "../../../../domain/contracts/behance.model";
import { BehanceConnectCallbackQuery, BehanceConnectQuery } from "../../behance/connect/behance-connect.handler";

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

  constructor(private readonly commandBus: CommandBus) { }

  @Get('connect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 302, description: 'FOUND', type: ConnectResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Connect(@Res() res: Response): Promise<Response | void> {
    // Behance has no official public API, using fallback logic
    // This allows manual profile linking via URL
    const state = stringUtil.generateRandomString(16);
    
    // For fallback, we'll use a manual linking flow
    // In a real implementation, this could redirect to a form where user enters their Behance profile URL
    const authorizeURL = `${configs.app?.url || ''}/integrations/behance/manual-link?state=${state}`;

    await this.commandBus.execute(new BehanceConnectQuery({ model: { state } }));
    return res.status(HttpStatus.FOUND).json({ authorizeURL: authorizeURL });
  }

  @Get('connect-callback')
  @ApiResponse({ status: 200, description: 'OK', type: BehanceConnectCallbackResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new BehanceConnectCallbackQuery({ model: { code, state } }));
    return res.status(HttpStatus.OK).json(result);
  }
}
