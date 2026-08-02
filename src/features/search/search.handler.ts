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

<<<<<<< HEAD
    try {
      return await this.orchestrator.execute(command.model);
=======
    // Only platforms with a dispatch case. Previously Object.values(PLATFORMS), which
    // also contains twitch, github and discord — so every unfiltered search returned
    // three "Unsupported platform" errors that clients had to know to ignore.
    const allPlatforms = _const.SEARCHABLE_PLATFORMS;

    const normalizedPlatforms =
      platforms && platforms.length > 0
        ? platforms.map((p) => p.toLowerCase())
        : null;

    const platformsToSearch =
      normalizedPlatforms && normalizedPlatforms.length > 0
        ? normalizedPlatforms.filter((p) => allPlatforms.includes(p))
        : allPlatforms;

    const tokenMap = new Map<string, string>();
    if (userId) {
      try {
        const linkedAccounts =
          await this.linkedAccountRepository.getByUserIdAsync(userId);
        const platforms = linkedAccounts.map((acc) => acc.platform);

        const loginPromises = platforms.map((platform) =>
          this.userLoginRepository
            .getByUserIdAndProviderAsync(userId, platform)
            .catch(() => null),
        );

        const userLogins = (await Promise.all(loginPromises)).filter(Boolean);
        userLogins.forEach((login: any) => {
          const token = this.extractAccessToken(login.tokenValue);
          if (token) {
            tokenMap.set(login.provider, token);
          }
        });
      } catch (error) {
        console.error('Error retrieving user tokens:', error);
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm, userId);

    const searchPromises = platformsToSearch.map((platform) =>
      this.searchPlatformOptimized(
        platform,
        searchTerm,
        normalizedQuery,
        filter,
        tokenMap.get(platform) || undefined,
        page,
        limit,
        paginationTokens[platform],
        forceRefresh,
      ).catch((error) => {
        console.error(`Error searching ${platform}:`, error);
        return {
          platform,
          error: error.message,
          result: null,
          paginationToken: null,
        };
      }),
    );

    const searchResults = await Promise.all(searchPromises);

    const response = new GlobalSearchResponseModel();
    response.query = searchTerm;
    response.platforms = platformsToSearch;
    response.page = page;
    response.limit = limit;

    let totalResults = 0;
    searchResults.forEach(({ platform, result, error, paginationToken }) => {
      if (result && !error) {
        response.results[platform] = result;
        // Extract pagination token from platform-specific response
        response.paginationTokens[platform] = this.extractPaginationToken(
          platform,
          result,
        );
        // Count results based on platform response structure
        totalResults += this.countResults(platform, result);
      } else {
        response.results[platform] = { error: error || 'Search failed' };
        response.paginationTokens[platform] = null;
      }
    });

    response.totalResults = totalResults;

    return response;
  }

  private async searchPlatformOptimized(
    platform: string,
    originalQuery: string,
    normalizedQuery: string,
    filter: Record<string, any> | undefined,
    accessToken: string | undefined,
    page: number,
    limit: number,
    paginationToken: string | undefined,
    forceRefresh: boolean | undefined,
  ): Promise<{
    platform: string;
    result: any;
    error?: string;
    paginationToken?: string | null;
  }> {
    try {
      // Access token is optional - some platforms support public search (YouTube, Reddit, Spotify)

      const searchParams = {
        page,
        normalizedQuery,
        originalQuery,
        limit,
        filters: filter || {},
        accessToken,
        paginationToken,
        forceRefresh: forceRefresh || false,
      };

      let result: any;

      switch (platform) {
        case _const.PLATFORMS.FACEBOOK:
          result = await this.searchService.searchFacebookAsync(searchParams);
          break;
        case _const.PLATFORMS.INSTAGRAM:
          result = await this.searchService.searchInstagramAsync(searchParams);
          break;
        case _const.PLATFORMS.TWITTER:
          result = await this.searchService.searchTwitterAsync(searchParams);
          break;
        case _const.PLATFORMS.LINKEDIN:
          result = await this.searchService.searchLinkedInAsync(searchParams);
          break;
        case _const.PLATFORMS.YOUTUBE:
          result = await this.searchService.searchYoutubeAsync(searchParams);
          break;
        case _const.PLATFORMS.GITHUB:
          result = await this.searchService.searchGithubAsync(searchParams);
          break;
        case _const.PLATFORMS.APPLE:
          result = await this.searchService.searchAppleAsync(searchParams);
          break;
        case _const.PLATFORMS.OPENVERSE:
          result = await this.searchService.searchOpenverseAsync(searchParams);
          break;
        case _const.PLATFORMS.HACKERNEWS:
          result = await this.searchService.searchHackernewsAsync(searchParams);
          break;
        case _const.PLATFORMS.SPOTIFY:
          result = await this.searchService.searchSpotifyAsync(searchParams);
          break;
        case _const.PLATFORMS.REDDIT:
          result = await this.searchService.searchRedditAsync(searchParams);
          break;
        case _const.PLATFORMS.PINTEREST:
          result = await this.searchService.searchPinterestAsync(searchParams);
          break;
        case _const.PLATFORMS.TIKTOK:
          result = await this.searchService.searchTiktokAsync(searchParams);
          break;
        case _const.PLATFORMS.SNAPCHAT:
          result = await this.searchService.searchSnapchatAsync(searchParams);
          break;
        case _const.PLATFORMS.THREADS:
          result = await this.searchService.searchThreadsAsync(searchParams);
          break;
        case _const.PLATFORMS.BEHANCE:
          result = await this.searchService.searchBehanceAsync(searchParams);
          break;
        default:
          return {
            platform,
            result: null,
            error: `Unsupported platform: ${platform}`,
          };
      }

      return { platform, result, paginationToken: null };
    } catch (error: any) {
      return {
        platform,
        result: null,
        error: error.message || 'Unknown error',
        paginationToken: null,
      };
    }
  }

  private extractPaginationToken(platform: string, result: any): string | null {
    if (!result) return null;

    try {
      switch (platform) {
        case _const.PLATFORMS.FACEBOOK:
          return (
            result.results?.posts?.paging?.cursors?.after ||
            result.results?.feeds?.paging?.cursors?.after ||
            null
          );
        case _const.PLATFORMS.INSTAGRAM:
          return result.after || null;
        case _const.PLATFORMS.TWITTER:
          return result.nextToken || null;
        case _const.PLATFORMS.LINKEDIN:
          // LinkedIn uses start (offset), return next start value if available
          if (result.start !== undefined && result.count) {
            return String(result.start + result.count);
          }
          return null;
        case _const.PLATFORMS.YOUTUBE:
          return result.nextPageToken || null;
        case _const.PLATFORMS.GITHUB:
        case _const.PLATFORMS.APPLE:
        case _const.PLATFORMS.OPENVERSE:
        case _const.PLATFORMS.HACKERNEWS:
          // Page-number pagination, not a cursor.
          return result.nextPage != null ? String(result.nextPage) : null;
        case _const.PLATFORMS.SPOTIFY:
          // Spotify uses offset, calculate next offset
          if (
            result.results?.tracks?.offset !== undefined &&
            result.results?.tracks?.items
          ) {
            const currentOffset = result.results.tracks.offset || 0;
            const itemsLength = result.results.tracks.items?.length || 0;
            return String(currentOffset + itemsLength);
          }
          return null;
        case _const.PLATFORMS.REDDIT:
          return result.after || null;
        case _const.PLATFORMS.PINTEREST:
          return result.bookmark || null;
        case _const.PLATFORMS.TIKTOK:
          return result.cursor || null;
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private extractAccessToken(
    tokenValue: string | null | undefined,
  ): string | null {
    if (!tokenValue) return null;

    try {
      const deserialized = deserializeObject<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      }>(tokenValue);
      if (deserialized && deserialized.access_token) {
        return deserialized.access_token;
      }
    } catch {
      // Deserialization failed - invalid token format
      return null;
    }

    return null;
  }

  private countResults(platform: string, result: any): number {
    if (!result || !result.results) return 0;

    try {
      switch (platform) {
        case _const.PLATFORMS.FACEBOOK: {
          const fbResults = result.results as any;
          return (
            (fbResults.feeds?.data?.length || 0) +
            (fbResults.posts?.data?.length || 0) +
            (fbResults.likes?.data?.length || 0) +
            (fbResults.groups?.data?.length || 0) +
            (fbResults.events?.data?.length || 0) +
            (fbResults.videos?.data?.length || 0) +
            (fbResults.pages?.data?.length || 0) +
            (fbResults.people?.data?.length || 0) +
            (fbResults.accounts?.length || 0)
          );
        }
        case _const.PLATFORMS.INSTAGRAM: {
          const igResults = result.results as any;
          return (
            (igResults.media?.length || 0) +
            (igResults.hashtags?.length || 0) +
            (igResults.accounts?.length || 0)
          );
        }
        case _const.PLATFORMS.TWITTER: {
          const twResults = result.results as any;
          return (
            (twResults.tweets?.length || 0) + (twResults.users?.length || 0)
          );
        }
        case _const.PLATFORMS.LINKEDIN: {
          const liResults = result.results as any;
          return (
            (liResults.posts?.length || 0) +
            (liResults.people?.length || 0) +
            (liResults.companies?.length || 0)
          );
        }
        case _const.PLATFORMS.YOUTUBE:
          return result.results?.length || 0;
        case _const.PLATFORMS.APPLE:
        case _const.PLATFORMS.OPENVERSE:
        case _const.PLATFORMS.HACKERNEWS:
          // These return a flat array rather than named sections.
          return Array.isArray(result.results) ? result.results.length : 0;
        case _const.PLATFORMS.GITHUB: {
          const ghResults = result.results as any;
          return (
            (ghResults.repositories?.length || 0) +
            (ghResults.users?.length || 0)
          );
        }
        case _const.PLATFORMS.SPOTIFY: {
          const spResults = result.results as any;
          return (
            (spResults.tracks?.length || 0) +
            (spResults.albums?.length || 0) +
            (spResults.playlists?.length || 0) +
            (spResults.artists?.length || 0) +
            (spResults.shows?.length || 0)
          );
        }
        case _const.PLATFORMS.REDDIT: {
          const rdResults = result.results as any;
          return (
            (rdResults.posts?.length || 0) +
            (rdResults.subreddits?.length || 0) +
            (rdResults.users?.length || 0)
          );
        }
        case _const.PLATFORMS.PINTEREST: {
          const pinResults = result.results as any;
          return (
            (pinResults.pins?.length || 0) +
            (pinResults.boards?.length || 0) +
            (pinResults.users?.length || 0)
          );
        }
        case _const.PLATFORMS.TIKTOK: {
          const ttResults = result.results as any;
          return (
            (ttResults.videos?.length || 0) + (ttResults.users?.length || 0)
          );
        }
        default:
          return 0;
      }
>>>>>>> other/staging
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
