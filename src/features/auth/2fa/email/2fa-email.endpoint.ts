import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedAccountGuard,
  TwoFAVerificationGuard,
} from '../../../../core/passport';
import {
  EnableTwoFactorEmailCommand,
  EnableTwoFactorEmailRequestModel,
  SendTwoFactorEmailCodeCommand,
} from './2fa-email.handler';

class SendCodeResponseModel {
  @ApiProperty() sent: boolean;
  @ApiProperty({ description: 'True when a code was sent very recently' })
  cooldown: boolean;
}

@ApiTags('Account')
@Controller({ path: `/account`, version: '1' })
export class TwoFactorEmailController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Resend the sign-in code.
   *
   * Guarded by the *two-factor* token, not the full session token — the caller
   * is mid-login and does not have a session yet. Using the authenticated
   * guard here would make resend impossible, which is when it is needed.
   */
  @Post('2fa/email/send')
  @UseGuards(TwoFAVerificationGuard)
  @ApiResponse({ status: 200, description: 'OK', type: SendCodeResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async send(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(
      new SendTwoFactorEmailCodeCommand(),
    );
    return res.status(HttpStatus.OK).json(result);
  }

  /** Send a code to the signed-in user, while turning the method on. */
  @Post('2fa/email/request')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 200, description: 'OK', type: SendCodeResponseModel })
  public async request(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(
      new SendTwoFactorEmailCodeCommand(),
    );
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('2fa/email/enable')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiBody({ type: EnableTwoFactorEmailRequestModel })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  public async enable(
    @Body() model: EnableTwoFactorEmailRequestModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.commandBus.execute(new EnableTwoFactorEmailCommand({ model }));
    return res.status(HttpStatus.OK).json({
      message: 'Two-factor sign-in by email is on.',
    });
  }
}
