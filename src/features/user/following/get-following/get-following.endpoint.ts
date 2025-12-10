import { QueryBus } from "@nestjs/cqrs";
import { ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { FollowModel } from "../../../../domain/contracts/follow.model";
import { GetFollowingQuery } from "./get-following.handler";
import { FollowStatus } from "../../../../domain/enums";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class FollowingController {

  constructor(private readonly queryBus: QueryBus) { }

  @Get(':userId/following')
  @ApiParam({ name: 'userId', description: 'User whose following list to retrieve' })
  @ApiQuery({ name: 'status', required: false, enum: FollowStatus, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'OK', type: [FollowModel] })
  public async getFollowing(
    @Param('userId') userId: string,
    @Query('status') status?: FollowStatus
  ): Promise<FollowModel[]> {

    return this.queryBus.execute(
      new GetFollowingQuery(
        userId,
        status as FollowStatus
      )
    );
  }
}
