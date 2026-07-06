import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Delete, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { TwitterDisconnectCommand } from './twitter-disconnect.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/twitter`,
  version: '1',
})
export class TwitterDisconnectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Delete('disconnect')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async disconnect(@Res() res: Response): Promise<Response | void> {
    await this.commandBus.execute(new TwitterDisconnectCommand());
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Twitter account disconnected successfully' });
  }
}
