import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedAccountGuard,
  UserAccoutGuard,
} from '../../../../core/passport';
import {
  UpdateBasicInfoCommand,
  UpdateBasicInfoModel,
} from './update-basic-info.handler';

@ApiTags('Account')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdateBasicInfoController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch('basic-info')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Update(
    @Body() request: UpdateBasicInfoModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(
      new UpdateBasicInfoCommand({ model: request }),
    );
    res.status(HttpStatus.NO_CONTENT).send(null);
    return res;
  }
}
