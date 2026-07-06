import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../core/passport';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ChangePasswordCommand,
  ChangePasswordRequestModel,
} from './change-password.handler';

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class ChangePasswordController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('change-password')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: ChangePasswordRequestModel, required: false })
  public async ChangePassword(
    @Body() model: ChangePasswordRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new ChangePasswordCommand({ model }));
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Password changed successfully' });
  }
}
