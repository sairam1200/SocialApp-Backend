import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ConfirmPhoneNumberCommand } from './confirm-phone-number.handler';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../../core/passport';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

class ConfirmPhoneNumberModel {
  phoneNumber: string;
  token: string;
}

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class ConfirmPhoneNumberController {
  constructor(private readonly queryBus: CommandBus) {}

  @Post('phone-number/confirm')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: ConfirmPhoneNumberModel, required: true })
  public async Confirm(
    @Body() request: ConfirmPhoneNumberModel,
    @Res() res: Response,
  ): Promise<Response> {
    await this.queryBus.execute(
      new ConfirmPhoneNumberCommand({
        phoneNumber: request.phoneNumber,
        token: request.token,
      }),
    );
    res
      .status(HttpStatus.OK)
      .send({ message: 'Phone number updated successfully' });
    return res;
  }
}
