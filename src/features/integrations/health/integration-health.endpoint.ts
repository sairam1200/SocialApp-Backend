import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccoutGuard } from '../../../core/passport';
import {
  IntegrationHealthReport,
  IntegrationHealthService,
} from '../../../infrastructure/services/integrationHealth.service';

/**
 * Live integration health.
 *
 * Answers "which platform integrations actually work right now" without a human
 * running curl. Every platform call in the search fan-out is wrapped in `.catch()`, so
 * a dead credential and an empty result set look identical — the Pinterest token had
 * been returning 401 with nothing in the product saying so.
 *
 * **Admin-guarded.** The report names which credentials are rejected and includes
 * remediation text, which is reconnaissance for an attacker and of no use to a normal
 * user. It is also the only endpoint that deliberately calls out to third-party APIs on
 * request, so it must not be reachable anonymously.
 */
@ApiTags('Integrations')
@ApiBearerAuth()
@Controller({
  path: '/integrations/health',
  version: '1',
})
@UseGuards(AdminAccoutGuard)
export class IntegrationHealthController {
  constructor(private readonly health: IntegrationHealthService) {}

  @Get()
  @ApiQuery({
    name: 'forceRefresh',
    required: false,
    type: Boolean,
    description:
      'Bypass the 5-minute cache and re-probe. Use sparingly — each probe is a real request against a metered API.',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async getHealth(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<IntegrationHealthReport> {
    return this.health.getHealthAsync(forceRefresh === 'true');
  }
}
