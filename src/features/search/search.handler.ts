import _const from '../../core/utils/const';
import { ApiProperty } from '@nestjs/swagger';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SearchOrchestratorService } from './searchOrchestrator.service';
import { IAnalyticsService } from '../../domain/services/ianalytics.service';
import {
  SearchResponse,
  SearchEntityType,
} from '../../domain/contracts/search';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import logger from '../../core/utils/winston.util';

export class GlobalSearchRequestModel {
  @ApiProperty()
  searchTerm: string;

  @ApiProperty({
    required: false,
    description:
      'Array of platforms to search. If not provided, searches all available platforms.',
    example: ['facebook', 'instagram', 'twitter'],
  })
  platforms?: string[];

  @ApiProperty({ required: false })
  filter?: Record<string, any>;

  @ApiProperty({
    required: false,
    enum: SearchEntityType,
    description:
      'Server-side per-type filter. When set, only results of this entity type are returned and pagination applies to that type.',
  })
  type?: string;

  @ApiProperty({
    required: false,
    default: 1,
    description: 'Page number for pagination (default: 1)',
  })
  page?: number;

  @ApiProperty({
    required: false,
    default: 25,
    description: 'Number of results per page (default: 25)',
  })
  limit?: number;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;

  viewerUserId?: string;
}

export class GlobalSearchQuery {
  model: GlobalSearchRequestModel;

  constructor(request: Partial<GlobalSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GlobalSearchQuery)
export class GlobalSearchQueryHandler implements IQueryHandler<GlobalSearchQuery> {
  constructor(
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
    private readonly orchestrator: SearchOrchestratorService,
  ) {}

  public async execute(command: GlobalSearchQuery): Promise<SearchResponse> {
    const { searchTerm, platforms, page = 1, limit = 25 } = command.model;

    command.model.viewerUserId = HttpContext.getCurrentUserId;

    await this.analyticsService.trackEvent(
      _const.ANALYTICS_EVENTS.SEARCH.PERFORMED,
      {
        searchTerm,
        platforms: platforms || [],
        page,
        limit,
      },
    );

    try {
      return await this.orchestrator.execute(command.model);
    } catch (error) {
      logger.error('[Search] Orchestrator search failed:', error);
      return {
        query: searchTerm,
        items: [],
        pagination: { page, limit, total: 0, hasMore: false },
        facets: {
          [SearchEntityType.CONTENT]: 0,
          [SearchEntityType.PROFILE]: 0,
          [SearchEntityType.PROJECT]: 0,
          [SearchEntityType.JOB]: 0,
        },
      };
    }
  }
}
