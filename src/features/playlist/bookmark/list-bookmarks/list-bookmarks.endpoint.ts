import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { ListBookmarksQuery } from './list-bookmarks.handler';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class ListBookmarksController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('list')
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async List(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.commandBus.execute(
      new ListBookmarksQuery({
        model: {
          userNameOrId: HttpContext.getCurrentUserId,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 20,
        },
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
