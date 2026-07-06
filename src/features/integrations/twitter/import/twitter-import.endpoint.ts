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
  TwitterImportCommand,
  TwitterImportRequestModel,
} from './twitter-import.handler';
import {
  CancelTwitterImportCommand,
  CancelTwitterImportRequestModel,
} from './cancel-twitter-import.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/twitter`,
  version: '1',
})
export class TwitterImportController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: TwitterImportRequestModel, required: false })
  public async Import(
    @Body() model: TwitterImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new TwitterImportCommand({ model }),
    );
    if (model.twitterAccessToken) {
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Twitter import has begun.' });
    }

    return res
      .status(HttpStatus.OK)
      .json({ message: 'Twitter import has begun.', ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelTwitterImportRequestModel })
  public async Cancel(
    @Body() model: CancelTwitterImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelTwitterImportCommand({ model }));
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Twitter import cancellation and rollback requested.' });
  }
}
