import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { YoutubeDisconnectCommand } from './youtube-disconnect.handler';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Delete, HttpStatus, Res, UseGuards } from '@nestjs/common';

@ApiTags('YouTube')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeDisconnectController {
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
    await this.commandBus.execute(new YoutubeDisconnectCommand());
    return res.status(HttpStatus.OK).json({ message: 'YouTube account disconnected successfully' });
  }
}

