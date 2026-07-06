import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Setup2FACommand } from './2fa-setup.handler';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../../core/passport';
import { Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';

class Setup2FAResponseModel {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  qrcode: string;

  @ApiProperty()
  message: 'Scan this QR code in your 2FA app to enable authentication.';
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class Setup2FAController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('2fa/setup')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: Setup2FAResponseModel })
  public async Setup(@Res() res: Response): Promise<Response | void> {
    const result = await this.commandBus.execute(new Setup2FACommand());

    return res.status(HttpStatus.OK).json({
      ...result,
      message: 'Scan this QR code in your 2FA app to enable authentication.',
    });
  }
}
