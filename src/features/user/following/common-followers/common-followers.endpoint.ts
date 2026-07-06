import { QueryBus } from '@nestjs/cqrs';
import { ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param } from '@nestjs/common';
import { FollowModel } from '../../../../domain/contracts/follow.model';
import { GetCommonFollowersQuery } from './common-followers.handler';

@ApiTags('Social')
@Controller({
  path: `/user`,
  version: '1',
})
export class CommonFollowersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':userId/common-followers/:otherUserId')
  @ApiParam({ name: 'userId', description: 'Primary user' })
  @ApiParam({ name: 'otherUserId', description: 'Other user to compare with' })
  @ApiResponse({ status: 200, description: 'OK', type: [FollowModel] })
  public async getCommonFollowers(
    @Param('userId') userId: string,
    @Param('otherUserId') otherUserId: string,
  ): Promise<FollowModel[]> {
    return this.queryBus.execute(
      new GetCommonFollowersQuery(userId, otherUserId),
    );
  }
}
