import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { BookmarkCountQuery } from './bookmark-count.handler';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class BookmarkCountController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('count')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Count(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(
      new BookmarkCountQuery({
        model: {
          userNameOrId: HttpContext.getCurrentUserId,
        },
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
