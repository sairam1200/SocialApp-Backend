import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { TikTokImportCommand } from './tiktok-import.handler';

class TikTokImportResponseModel {
  @ApiProperty()
  success: boolean;
  @ApiProperty()
  message: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TikTokImportController {
  constructor(private readonly commandBus: CommandBus) { }

  @Post('import')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: TikTokImportResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Import(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new TikTokImportCommand());
    return res.status(HttpStatus.OK).json(result);
  }
}
