import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../core/passport/permissions.guard';
import { ActivateUserRoleCommand } from './activate-user-role.handler';
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
export class ActivateUserRoleController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('role/activate')
  @UseGuards(PermissionsGuard)
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'roleId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Activate(
    @Query('userId') userId: string,
    @Query('roleId') roleId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.commandBus.execute(
      new ActivateUserRoleCommand({ userId, roleId }),
    );
    res.status(HttpStatus.NO_CONTENT).send(null);
  }
}
