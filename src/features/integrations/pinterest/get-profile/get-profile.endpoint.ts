import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { PinterestProfileQuery } from "./get-profile.handler";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { BadRequestException, Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/pinterest`,
  version: '1',
})
export class PinterestProfileController {

  constructor(
    private readonly queryBus: QueryBus
  ) { }

  @Get('me')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Me(
    @Res() res: Response
  ): Promise<Response | void> {

    const userId = HttpContext.getCurrentUserId;
    const result = await this.queryBus.execute(new PinterestProfileQuery({ model: { userId } }));

    return res.status(HttpStatus.OK).json(result);
  }

  @Get('profile')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'userName', required: false })
  @ApiQuery({ name: 'pinterestId', required: false })
  public async Profile(
    @Query('userId') userId: string,
    @Query('userName') userName: string,
    @Query('pinterestId') pinterestId: string,
    @Res() res: Response,
  ): Promise<Response | void> {

    const params = [userId, userName, pinterestId].filter(param => param !== undefined && param !== null);
    if (params.length > 1) {
      throw new BadRequestException('Only one of the following query parameters should be provided: userId, userName, or pinterestId.',);
    }

    const result = await this.queryBus.execute(new PinterestProfileQuery({ model: { userId, userName, pinterestId } }));

    return res.status(HttpStatus.OK).json(result);
  }
}