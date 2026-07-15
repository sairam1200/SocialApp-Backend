import { QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiParam, ApiResponse } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Get, UseGuards, Param } from '@nestjs/common';
import { PublishStatusQuery } from './publish-status.command';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';

class PublishStatusResponseDto {
  id: string;
  platform: string;
  status: string;
  progress: number;
  statusMessage?: string;
  platformContentId?: string;
  platformContentUrl?: string;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
  createdAt: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/publish`,
  version: '1',
})
export class PublishStatusController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('status/:publishJobId')
  @UseGuards(UserAccoutGuard)
  @ApiParam({ name: 'publishJobId', description: 'Publish job ID' })
  @ApiResponse({
    status: 200,
    description: 'Publish job status',
    type: PublishStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async getStatus(
    @Param('publishJobId') publishJobId: string,
  ): Promise<PublishStatusResponseDto> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    return this.queryBus.execute(new PublishStatusQuery(userId, publishJobId));
  }
}
