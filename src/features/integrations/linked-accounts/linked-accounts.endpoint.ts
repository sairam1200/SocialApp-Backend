import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../core/passport/account.guard';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { GetUserLinkedAccountsQuery } from './linked-accounts.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations`,
  version: '1',
})
export class LinkedAccountsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('me/linked-accounts')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async Get(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new GetUserLinkedAccountsQuery());
    return res.status(HttpStatus.OK).json(result);
  }
}
