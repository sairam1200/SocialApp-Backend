import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { TiktokProfileQuery } from './get-profile.handler';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { TiktokProfileModel } from '../../../../domain/contracts/tiktok.model';
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
  path: `/integrations/tiktok`,
  version: '1',
})
export class TikTokProfileController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('me')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Me(@Res() res: Response): Promise<Response | void> {
    const userId = HttpContext.getCurrentUserId;
    const result = await this.commandBus.execute(
      new TiktokProfileQuery({ model: { userId } }),
    );

    return res.status(HttpStatus.OK).json(result);
  }

  @Get('profile')
  @ApiResponse({ status: 200, description: 'OK', type: TiktokProfileModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'userName', required: false })
  @ApiQuery({ name: 'tiktokId', required: false })
  public async Profile(
    @Query('userId') userId: string,
    @Query('userName') userName: string,
    @Query('tiktokId') tiktokId: string,
    @Res() res: Response,
  ): Promise<Response | void> {
    const params = [userId, userName, tiktokId].filter(
      (param) => param !== undefined && param !== null,
    );
    if (params.length > 1) {
      throw new BadRequestException(
        'Only one of the following query parameters should be provided: userId, userName, or tiktokId.',
      );
    }

    const result = await this.commandBus.execute(
      new TiktokProfileQuery({ model: { userId, userName, tiktokId } }),
    );

    return res.status(HttpStatus.OK).json(result);
  }
}
