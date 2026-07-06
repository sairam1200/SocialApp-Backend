import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { EnableSnapchatSyncCommand } from '../../snapchat/sync/enable-snapchat-sync.handler';
import { DisableSnapchatSyncCommand } from '../../snapchat/sync/disable-snapchat-sync.handler';

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/snapchat`,
  version: '1',
})
export class SnapchatSyncController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('sync/enable')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async EnableSync(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new EnableSnapchatSyncCommand(),
    );
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
      new DisableSnapchatSyncCommand(),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
