import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { EnableRedditSyncCommand } from './enable-reddit-sync.handler';
import { DisableRedditSyncCommand } from './disable-reddit-sync.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/reddit`,
  version: '1',
})
export class RedditSyncController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('sync/enable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async EnableSync(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new EnableRedditSyncCommand());
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('sync/disable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async DisableSync(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new DisableRedditSyncCommand(),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
