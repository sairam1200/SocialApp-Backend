import { Response } from 'express';
import configs from '../../../configs';
import { CommandBus } from '@nestjs/cqrs';
import { TokenResponseModel } from '../../../domain/contracts/tokenResponse.model';
import { RefreshTokenGuard } from '../../../core/passport';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  BadGatewayException,
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  RefreshTokenCommand,
  RefreshTokenRequestModel,
} from './refresh-token.handler';
import { ErrorHandlersFilter } from '../../../core/exceptions/exceptionHandler.filter';

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
export class RefreshTokenController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('refresh-access-token')
  @UseFilters(ErrorHandlersFilter)
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 200, description: 'OK', type: TokenResponseModel })
  public async RefreshAccessToken(
    @Body() request: RefreshTokenRequestModel,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.commandBus.execute(
        new RefreshTokenCommand({
          model: request,
        }),
      );

      return res.status(HttpStatus.OK).send(result);
    } catch (error) {
      res.setHeader('Set-Cookie', CLEAR_COOKIES_HEADER);
      throw error;
    }
  }
}
