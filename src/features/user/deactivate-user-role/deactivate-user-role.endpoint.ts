import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../core/passport/permissions.guard';
import {
  DeactivateUserRoleCommand,
  DeactivateUserRoleModel,
} from './deactivate-user-role.handler';
import {
  Body,
  Controller,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Users')
@UseGuards(PermissionsGuard)
@Controller({
  path: `/user`,
  version: '1',
})
export class DeactivateUserRoleController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('role/deactivate')
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Deactivate(
    @Body() request: DeactivateUserRoleModel,
    @Res() res: Response,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeactivateUserRoleCommand({ model: request }),
    );
    res.status(HttpStatus.NO_CONTENT).send(null);
  }
}
