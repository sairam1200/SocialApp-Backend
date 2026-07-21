import { Response } from 'express';
import configs from '../../../configs';
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

const isProduction = configs.env === 'production';
const cookieDomain = isProduction ? '.gaddr.com' : undefined;

function buildClearCookie(name: string): string {
  const domainPart = cookieDomain ? `Domain=${cookieDomain}; ` : '';
  return `${name}=; Path=/; ${domainPart}Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

const CLEAR_COOKIES_HEADER = [
  `${buildClearCookie('access_token')}; HttpOnly`,
  buildClearCookie('refresh_token') + '; HttpOnly',
  buildClearCookie('better-auth.session_token'),
];

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

    res.setHeader('Set-Cookie', CLEAR_COOKIES_HEADER);

    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
