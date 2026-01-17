import _const from "../../core/utils/const";
import { ApiProperty } from "@nestjs/swagger";
import fuseUtil from "../../core/utils/fuse.util";
import { SearchHistory } from "../../domain/entities";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { Inject } from "@nestjs/common";
import { ISearchService } from "../../domain/services/isearch.service";
import { deserializeObject } from "../../core/utils/serialization.util";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { ISearchHistoryRepository, IUserLoginRepository, ILinkedAccountRepository } from "../../domain/repositories";

export class GlobalSearchRequestModel {
  @ApiProperty()
  searchTerm: string;

  @ApiProperty({ required: false, description: "Array of platforms to search. If not provided, searches all available platforms.", example: ["facebook", "instagram", "twitter"] })
  platforms?: string[];

  @ApiProperty({ required: false })
  filter?: Record<string, any>;

  @ApiProperty({ required: false, default: 1, description: "Page number for pagination (default: 1)" })
  page?: number;

  @ApiProperty({ required: false, default: 25, description: "Number of results per platform (default: 25)" })
  limit?: number;

  @ApiProperty({ required: false, description: "Platform-specific pagination tokens/cursors. Keys are platform names, values are their respective pagination tokens.", example: { "youtube": "CAoQAA", "facebook": "next_page_token", "instagram": "cursor_abc123" } })
  paginationTokens?: Record<string, string>;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class GlobalSearchQuery {
  model: GlobalSearchRequestModel;

  constructor(request: Partial<GlobalSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GlobalSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  platforms: string[];

  @ApiProperty({ type: Object })
  results: {
    facebook?: any;
    instagram?: any;
    twitter?: any;
    linkedin?: any;
    youtube?: any;
    spotify?: any;
    reddit?: any;
    pinterest?: any;
    tiktok?: any;
  };

  @ApiProperty({ type: Object, description: "Platform-specific pagination tokens/cursors for next page", example: { "youtube": "CAoQAA", "facebook": "next_page_token" } })
  paginationTokens: Record<string, string | null>;

  @ApiProperty()
  totalResults: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  constructor() {
    this.query = '';
    this.platforms = [];
    this.results = {};
    this.paginationTokens = {};
    this.totalResults = 0;
    this.page = 1;
    this.limit = 25;
  }
}

@QueryHandler(GlobalSearchQuery)
export class GlobalSearchQueryHandler implements IQueryHandler<GlobalSearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: GlobalSearchQuery): Promise<GlobalSearchResponseModel> {
    const { searchTerm, platforms, filter, page = 1, limit = 25, paginationTokens = {}, forceRefresh } = command.model;
    const userId = HttpContext.getCurrentUserId;

    const allPlatforms = Object.values(_const.PLATFORMS);

    const normalizedPlatforms = platforms && platforms.length > 0
      ? platforms.map(p => p.toLowerCase())
      : null;

    const platformsToSearch = normalizedPlatforms && normalizedPlatforms.length > 0
      ? normalizedPlatforms.filter(p => allPlatforms.includes(p))
      : allPlatforms;

    let tokenMap = new Map<string, string>();
    if (userId) {
      try {
        const linkedAccounts = await this.linkedAccountRepository.getByUserIdAsync(userId);
        const platforms = linkedAccounts.map(acc => acc.platform);

        const loginPromises = platforms.map(platform =>
          this.userLoginRepository.getByUserIdAndProviderAsync(userId, platform)
            .catch(() => null)
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

    const searchPromises = platformsToSearch.map(platform =>
      this.searchPlatformOptimized(
        platform,
        searchTerm,
        normalizedQuery,
        filter,
        tokenMap.get(platform) || undefined,
        page,
        limit,
        paginationTokens[platform],
        forceRefresh
      )
        .catch(error => {
          console.error(`Error searching ${platform}:`, error);
          return { platform, error: error.message, result: null, paginationToken: null };
        })
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
        response.paginationTokens[platform] = this.extractPaginationToken(platform, result);
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
    forceRefresh: boolean | undefined
  ): Promise<{ platform: string; result: any; error?: string; paginationToken?: string | null }> {
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
        default:
          return { platform, result: null, error: `Unsupported platform: ${platform}` };
      }

      return { platform, result, paginationToken: null };
    } catch (error: any) {
      return { platform, result: null, error: error.message || 'Unknown error', paginationToken: null };
    }
  }

  private extractPaginationToken(platform: string, result: any): string | null {
    if (!result) return null;

    try {
      switch (platform) {
        case _const.PLATFORMS.FACEBOOK:
          return result.results?.posts?.paging?.cursors?.after ||
            result.results?.feeds?.paging?.cursors?.after || null;
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
        case _const.PLATFORMS.SPOTIFY:
          // Spotify uses offset, calculate next offset
          if (result.results?.tracks?.offset !== undefined && result.results?.tracks?.items) {
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

  private extractAccessToken(tokenValue: string | null | undefined): string | null {
    if (!tokenValue) return null;

    try {
      const deserialized = deserializeObject<{ access_token?: string; refresh_token?: string; expires_in?: number }>(tokenValue);
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
        case _const.PLATFORMS.FACEBOOK:
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
        case _const.PLATFORMS.INSTAGRAM:
          const igResults = result.results as any;
          return (
            (igResults.media?.length || 0) +
            (igResults.hashtags?.length || 0) +
            (igResults.accounts?.length || 0)
          );
        case _const.PLATFORMS.TWITTER:
          const twResults = result.results as any;
          return (
            (twResults.tweets?.length || 0) +
            (twResults.users?.length || 0)
          );
        case _const.PLATFORMS.LINKEDIN:
          const liResults = result.results as any;
          return (
            (liResults.posts?.length || 0) +
            (liResults.people?.length || 0) +
            (liResults.companies?.length || 0)
          );
        case _const.PLATFORMS.YOUTUBE:
          return (result.results?.length || 0);
        case _const.PLATFORMS.SPOTIFY:
          const spResults = result.results as any;
          return (
            (spResults.tracks?.length || 0) +
            (spResults.albums?.length || 0) +
            (spResults.playlists?.length || 0) +
            (spResults.artists?.length || 0) +
            (spResults.shows?.length || 0)
          );
        case _const.PLATFORMS.REDDIT:
          const rdResults = result.results as any;
          return (
            (rdResults.posts?.length || 0) +
            (rdResults.subreddits?.length || 0) +
            (rdResults.users?.length || 0)
          );
        case _const.PLATFORMS.PINTEREST:
          const pinResults = result.results as any;
          return (
            (pinResults.pins?.length || 0) +
            (pinResults.boards?.length || 0) +
            (pinResults.users?.length || 0)
          );
        case _const.PLATFORMS.TIKTOK:
          const ttResults = result.results as any;
          return (
            (ttResults.videos?.length || 0) +
            (ttResults.users?.length || 0)
          );
        default:
          return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  private async normalizeQueryAsync(query: string, userId?: string | null): Promise<string> {
    const trimmedQuery = (query ?? '').trim();
    if (!trimmedQuery) {
      return '';
    }

    const similarQueries =
      (await this.searchHistoryRepository.findSimilarQueriesAsync(trimmedQuery)) ?? [];

    const candidateValues = similarQueries
      .map((item) => item.normalizedQuery)
      .filter(Boolean)
      .slice(0, 50);

    const normalizedQuery = fuseUtil.normalizeSearchTerm(trimmedQuery, candidateValues);

    // Only save search history if user is logged in
    if (userId) {
      const hasExistingEntry = similarQueries.some((item) => {
        const original = (item.originalQuery ?? '').trim().toLowerCase();
        return (
          original === trimmedQuery.toLowerCase() ||
          item.normalizedQuery === normalizedQuery
        );
      });

      if (!hasExistingEntry && normalizedQuery) {
        await this.searchHistoryRepository.createAsync(
          new SearchHistory({
            originalQuery: trimmedQuery,
            userId,
            normalizedQuery,
          }),
        );
      }
    }

    return normalizedQuery;
  }
}