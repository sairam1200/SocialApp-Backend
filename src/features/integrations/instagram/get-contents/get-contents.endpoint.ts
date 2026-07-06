import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Globals } from '../../../../core/globals';
import { InstagramContentsQuery } from './get-contents.handler';
import { InstagramContentModel } from '../../../../domain/contracts/instagram.model';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/instagram`,
  version: '1',
})
export class InstagramContentsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('contents')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: CursorResult<InstagramContentModel>,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID (defaults to authenticated user)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  public async Contents(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('cursor') cursor?: string,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new InstagramContentsQuery({
        model: { userId, cursor },
      }),
    );

    return res.status(HttpStatus.OK).json(result);
  }
}
