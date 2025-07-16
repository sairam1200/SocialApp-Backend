import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { TikTokProfileModel } from '../../../../domain/contracts/tiktok.model';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { TikTokProfileQuery } from './get-profile.handler';

class TikTokProfileResponseModel {
  @ApiProperty({ type: TikTokProfileModel })
  profile: TikTokProfileModel;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TikTokProfileController {
  constructor(private readonly commandBus: CommandBus) { }

  @Get('profile')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: TikTokProfileResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetProfile(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new TikTokProfileQuery());
    return res.status(HttpStatus.OK).json({ profile: result });
  }
}
