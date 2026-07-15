import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../../core/passport';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LogoutCommand, LogoutRequestModel } from './logout.handler';

@ApiBearerAuth()
@ApiTags('Authentication')
@Controller({
  path: `/auth`,
  version: '1',
})
export class LogoutController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('logout')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: LogoutRequestModel, required: false })
  public async Logout(
    @Body() model: LogoutRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    await this.commandBus.execute(new LogoutCommand({ model }));

    res.setHeader('Set-Cookie', [
      'access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
      'refresh_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    ]);

    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
