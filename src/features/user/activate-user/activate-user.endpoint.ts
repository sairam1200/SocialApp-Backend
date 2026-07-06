import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ActivateUserCommand } from './activate-user.handler';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../core/passport/permissions.guard';
import {
  Controller,
  HttpStatus,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Users')
@UseGuards(PermissionsGuard)
@Controller({
  path: `/user`,
  version: '1',
})
export class ActivateUserController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('activate')
  @UseGuards(PermissionsGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Activate(
    @Query('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.commandBus.execute(new ActivateUserCommand({ userId }));
    res.status(HttpStatus.NO_CONTENT).send(null);
  }
}
