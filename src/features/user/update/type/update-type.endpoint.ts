import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateTypeCommand, UpdateTypeModel } from './update-type.handler';
import { PermissionsGuard } from '../../../../core/passport/permissions.guard';
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
export class UpdateTypeController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('type')
  @UseGuards(PermissionsGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Update(
    @Body() request: UpdateTypeModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(new UpdateTypeCommand({ model: request }));
    res.status(HttpStatus.NO_CONTENT).send(null);
    return res;
  }
}
