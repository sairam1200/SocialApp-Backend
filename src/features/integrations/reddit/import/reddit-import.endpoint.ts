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
  RedditImportCommand,
  RedditImportRequestModel,
} from './reddit-import.handler';
import {
  CancelRedditImportCommand,
  CancelRedditImportRequestModel,
} from './cancel-reddit-import.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/reddit`,
  version: '1',
})
export class RedditImportController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: RedditImportRequestModel, required: false })
  public async Import(
    @Body() model: RedditImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new RedditImportCommand({ model }),
    );

    if (model.redditAccessToken) {
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Reddit import has begun.' });
    }

    return res
      .status(HttpStatus.OK)
      .json({ message: 'Reddit import has begun.', ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelRedditImportRequestModel })
  public async Cancel(
    @Body() model: CancelRedditImportRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelRedditImportCommand({ model }));
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Reddit import cancellation and rollback requested.' });
  }
}
