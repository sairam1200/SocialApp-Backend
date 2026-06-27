import { QueryBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { Controller, Get, Param } from "@nestjs/common";
import { FollowStatusModel } from "../../../../domain/contracts/follow-status.model";
import { GetFollowStatusQuery } from "./follow-status.handler";

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class FollowStatusController {
  constructor(private readonly queryBus: QueryBus) { }

  @Get(':userId/follow-status')
  @ApiParam({ name: 'userId', description: 'User to check follow status for' })
  @ApiResponse({ status: 200, description: 'OK', type: FollowStatusModel })
  public async getFollowStatus(
    @Param('userId') userId: string,
  ): Promise<FollowStatusModel> {
    return this.queryBus.execute(
      new GetFollowStatusQuery(userId),
    );
  }
}
