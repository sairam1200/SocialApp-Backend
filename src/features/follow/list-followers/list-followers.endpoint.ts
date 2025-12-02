import { QueryBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { FollowListModel } from "../../../domain/contracts/follow.model";
import { GetFollowersQuery } from "./list-followers.handler";
import { FollowStatus } from "../../../domain/enums";

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
  @ApiResponse({ status: 200, description: 'OK', type: FollowListModel })
  public async getFollowers(
    @Param('userId') userId: string,
    @Query('status') status?: FollowStatus
  ): Promise<FollowListModel> {

    return this.queryBus.execute(
      new GetFollowersQuery(
        userId,
        status as FollowStatus
      )
    );
  }
}
