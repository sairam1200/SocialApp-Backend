import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Globals } from '../../../../core/globals';
import { BehanceProfileQuery } from './get-profile.handler';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/behance`,
  version: '1',
})
export class BehanceProfileController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('me')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Me(@Res() res: Response): Promise<Response | void> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const result = await this.commandBus.execute(
      new BehanceProfileQuery({ model: { userId } }),
    );

    return res.status(HttpStatus.OK).json(result);
  }

  @Get('profile')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'userName', required: false })
  @ApiQuery({ name: 'behanceId', required: false })
  public async Profile(
    @Query('userId') userId: string,
    @Query('userName') userName: string,
    @Query('behanceId') behanceId: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    const params = [userId, userName, behanceId].filter(
      (param) => param !== undefined && param !== null,
    );
    if (params.length > 1) {
      throw new BadRequestException(
        'Only one of the following query parameters should be provided: userId, userName, or behanceId.',
      );
    }

    const result = await this.commandBus.execute(
      new BehanceProfileQuery({ model: { userId, userName, behanceId } }),
    );

    return res.status(HttpStatus.OK).json(result);
  }
}
