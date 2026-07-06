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
  BehanceImportCommand,
  BehanceImportRequestModel,
} from './behance-import.handler';
import {
  CancelBehanceImportCommand,
  CancelBehanceImportRequestModel,
} from './cancel-behance-import.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/behance`,
  version: '1',
})
export class BehanceImportController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: BehanceImportRequestModel, required: false })
  public async Import(
    @Body() model: BehanceImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new BehanceImportCommand({ model }),
    );
    if (model.behanceAccessToken) {
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Behance import has begun.' });
    }

    return res
      .status(HttpStatus.OK)
      .json({ message: 'Behance import has begun.', ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelBehanceImportRequestModel })
  public async Cancel(
    @Body() model: CancelBehanceImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelBehanceImportCommand({ model }));
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Behance import cancellation and rollback requested.' });
  }
}
