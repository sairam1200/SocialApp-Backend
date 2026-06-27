import { QueryBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { FollowModel } from "../../../../domain/contracts/follow.model";
import { GetFollowersQuery } from "./get-followers.handler";
import { FollowStatus } from "../../../../domain/enums";
import { PaginatedResult } from "../../../../domain/repositories/iuserFollow.repository";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class FollowersController {

  constructor(private readonly queryBus: QueryBus) { }

  @Get(':userId/followers')
  @ApiParam({ name: 'userId', description: 'User whose followers to retrieve' })
  @ApiQuery({ name: 'status', required: false, enum: FollowStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({ status: 200, description: 'OK' })
  public async getFollowers(
    @Param('userId') userId: string,
    @Query('status') status?: FollowStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ): Promise<PaginatedResult<FollowModel>> {

    return this.queryBus.execute(
      new GetFollowersQuery(
        userId,
        status as FollowStatus,
        Math.min(page ?? 20, 100),
        Math.min(limit ?? 20, 100),
      )
    );
  }
}
