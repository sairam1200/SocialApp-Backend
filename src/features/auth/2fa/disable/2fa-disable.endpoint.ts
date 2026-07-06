import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Disable2FACommand } from './2fa-disable.handler';
import { AuthenticatedAccountGuard } from '../../../../core/passport';
import { ApiBody, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

class Disable2FAResponseModel {
  @ApiProperty({ default: 'Two-factor authentication disabled successfully.' })
  message: string;
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class Disable2FAController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('2fa/disable')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: Disable2FAResponseModel,
  })
  public async Disable(@Res() res: Response): Promise<Response | void> {
    await this.commandBus.execute(new Disable2FACommand());

    return res.status(HttpStatus.OK).json({
      message: 'Two-factor authentication disabled successfully.',
    });
  }
}
