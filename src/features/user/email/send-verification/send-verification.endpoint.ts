import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  SendVerificationEmailCommand,
  SendVerificationEmailRequestModel,
} from './send-verification.handler';

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class SendVerificationEmailController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('email/send-verification')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: SendVerificationEmailRequestModel, required: false })
  public async SendVerificationEmail(
    @Body() model: SendVerificationEmailRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new SendVerificationEmailCommand({ model }));
    return res
      .status(HttpStatus.OK)
      .json({ message: 'Verification email sent successfully' });
  }
}
