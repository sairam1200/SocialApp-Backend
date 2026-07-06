import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { UpdatePhoneNumberCommand } from './update-phone-number.handler';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../../core/passport';
import {
  Controller,
  HttpStatus,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdatePhoneNumberController {
  constructor(private readonly queryBus: CommandBus) {}

  @Patch('phone-number/update')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'phoneNumber', required: true, type: String })
  public async Update(
    @Res() res: Response,
    @Query('phoneNumber') phoneNumber?: string,
  ): Promise<Response> {
    await this.queryBus.execute(new UpdatePhoneNumberCommand({ phoneNumber }));
    res.status(HttpStatus.NO_CONTENT).send({});
    return res;
  }
}
