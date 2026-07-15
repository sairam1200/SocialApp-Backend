import { QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { PublishCapabilitiesQuery } from './publish-capabilities.command';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/publish`,
  version: '1',
})
export class PublishCapabilitiesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('capabilities')
  @UseGuards(UserAccoutGuard)
  @ApiQuery({
    name: 'platform',
    required: false,
    description: 'Filter by platform',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform publishing capabilities',
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getCapabilities(
    @Query('platform') platform?: string,
  ): Promise<Record<string, any>> {
    return this.queryBus.execute(new PublishCapabilitiesQuery(platform));
  }
}
