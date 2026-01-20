import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TiktokDisconnectCommand } from './tiktok-disconnect.handler';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Delete, HttpStatus, Res, UseGuards } from '@nestjs/common';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TiktokDisconnectController {
  constructor(
    private readonly commandBus: CommandBus,
  ) { }

  @Delete('disconnect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async disconnect(
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new TiktokDisconnectCommand());
    return res.status(HttpStatus.OK).json({ message: 'TikTok account disconnected successfully' });
  }
}

