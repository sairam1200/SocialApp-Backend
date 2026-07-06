import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Delete, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { RedditDisconnectCommand } from './reddit-disconnect.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/reddit`,
  version: '1',
})
export class RedditDisconnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Delete('disconnect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async disconnect(@Res() res: Response): Promise<Response | void> {
    await this.commandBus.execute(new RedditDisconnectCommand());
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Reddit account disconnected successfully' });
  }
}
