import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { ImportResponseModel } from '../../../../domain/contracts/response.model';
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { TiktokImportCommand, TiktokImportRequestModel } from './tiktok-import.handler';
import { CancelTiktokImportCommand, CancelTiktokImportRequestModel } from './cancel-tiktok-import.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TikTokImportController {
  constructor(private readonly commandBus: CommandBus) { }

  @Post('import')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: ImportResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: TiktokImportRequestModel, required: false })
  public async Import(
    @Body() model: TiktokImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new TiktokImportCommand({ model }));
    if (model.tiktokAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Tiktok import has begun." });
    }
    
    return res.status(HttpStatus.OK).json({ message: "Tiktok import has begun.", ...result });
  }

  @Post('import/cancel')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelTiktokImportRequestModel })
  public async Cancel(
    @Body() model: CancelTiktokImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelTiktokImportCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "TikTok import cancellation and rollback requested." });
  }
}
