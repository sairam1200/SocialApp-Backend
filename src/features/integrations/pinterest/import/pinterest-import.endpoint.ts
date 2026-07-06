import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  PinterestImportCommand,
  PinterestImportRequestModel,
} from './pinterest-import.handler';
import {
  CancelPinterestImportCommand,
  CancelPinterestImportRequestModel,
} from './cancel-pinterest-import.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/pinterest`,
  version: '1',
})
export class PinterestImportController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: PinterestImportRequestModel, required: false })
  public async Import(
    @Body() model: PinterestImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new PinterestImportCommand({ model }),
    );
    if (model?.pinterestAccessToken) {
      return res.status(HttpStatus.OK).json({
        message: 'Pinterest import has begun.',
      });
    }

    return res
      .status(HttpStatus.OK)
      .json({ message: 'Pinterest import has begun.', ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelPinterestImportRequestModel })
  public async Cancel(
    @Body() model: CancelPinterestImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelPinterestImportCommand({ model }));
    return res.status(HttpStatus.OK).json({
      message: 'Pinterest import cancellation and rollback requested.',
    });
  }
}
