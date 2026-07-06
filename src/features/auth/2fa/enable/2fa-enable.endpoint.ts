import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { AuthenticatedAccountGuard } from '../../../../core/passport';
import { Enable2FACommand, Enable2FAModel } from './2fa-enable.handler';
import { ApiBody, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

class Enable2FAResponseModel {
  @ApiProperty({ default: 'Two-factor authentication enabled successfully.' })
  message: string;
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class Enable2FAController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('2fa/enable')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: Enable2FAResponseModel })
  @ApiBody({ type: Enable2FAModel, required: false })
  public async Enable(
    @Body() model: Enable2FAModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new Enable2FACommand({ model }));

    return res.status(HttpStatus.OK).json({
      message: 'Two-factor authentication enabled successfully.',
    });
  }
}
