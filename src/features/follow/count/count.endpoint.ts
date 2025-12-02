import { QueryBus } from "@nestjs/cqrs";
import { ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, Get, Param } from "@nestjs/common";
import { FollowCountsModel } from "../../../domain/contracts/follow.model";
import { GetFollowCountsQuery } from "./count.handler";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class FollowCountsController {

  constructor(private readonly queryBus: QueryBus) { }

  @Get(':userId/follow-counts')
  @ApiParam({ name: 'userId', description: 'User whose follow counts to retrieve' })
  @ApiResponse({ status: 200, description: 'OK', type: FollowCountsModel })
  public async getCounts(
    @Param('userId') userId: string,
  ): Promise<FollowCountsModel> {

    return this.queryBus.execute(
      new GetFollowCountsQuery(userId)
    );
  }
}
