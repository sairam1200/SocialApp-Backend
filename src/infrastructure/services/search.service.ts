import axios from 'axios';
import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import { Inject, Injectable } from '@nestjs/common';
import { ContentStream, LinkedAccount } from '../../domain/entities';
import { QueryOptions } from '../../domain/types/queryOptions.type';
import { ISearchService } from '../../domain/services/isearch.service';
import limitAllocatorUtil, {
  SectionSkipMap,
} from '../../core/utils/limitAllocator.util';
import {
  YoutubeChannelDataType,
  YoutubeSearchResponseModel,
  YouTubeSearchResponseDataType,
  YouTubeContentModel,
} from '../../domain/contracts/youtube.model';
import { ExpiringMemoryCache } from '../../core/utils/expiring-memory-cache';
import { ILinkedAccountRepository } from '../../domain/repositories';
import { IContentStreamRepository } from '../../domain/repositories/icontentStream.repository';
import { FacebookOnlineFilters } from 'domain/enums';
import { PlatformSearchParamsModel } from 'domain/contracts/platform-search.model';
import {
  FacebookAPIResponseModel,
  FacebookSearchResponseModel,
} from 'domain/contracts/facebook.model';
import { RedditSearchResponseModel } from 'domain/contracts/reddit.model';
import {
  SpotifySearchResponseModel,
  SpotifyTrackModel,
  SpotifyAlbumModel,
  SpotifyPlaylistModel,
  SpotifyArtistModel,
  SpotifyShowModel,
} from 'domain/contracts/spotify.model';
import { PinterestSearchResponseModel } from 'domain/contracts/pinterest.model';
import { TiktokSearchResponseModel } from 'domain/contracts/tiktok.model';
import { InstagramSearchResponseModel } from 'domain/contracts/instagram.model';
import { TwitterSearchResponseModel } from 'domain/contracts/twitter.model';
import { LinkedInSearchResponseModel } from 'domain/contracts/linkedin.model';
import { SnapchatSearchResponseModel } from 'domain/contracts/snapchat.model';
import { ThreadsSearchResponseModel } from 'domain/contracts/threads.model';
import { BehanceSearchResponseModel } from 'domain/contracts/behance.model';
import {
  mapContentStreamToFacebookOnlineModel,
  mapFacebookOnlineResponseToContentStream,
  mapToFacebookProfileModel,
} from 'domain/mappers/facebook.mapper';
import { mapToRedditProfileModel } from 'domain/mappers/reddit.mapper';
import { mapToPinterestProfileModel } from 'domain/mappers/pinterest.mapper';
import { mapToInstagramProfileModel } from 'domain/mappers/instagram.mapper';
import { mapToTiktokProfileModel } from 'domain/mappers/tiktok.mapper';
import { mapToLinkedInProfileModel } from 'domain/mappers/linkedin.mapper';
import { mapToTwitterProfileModel } from 'domain/mappers/twitter.mapper';
import { RedditContentModel } from '../../domain/contracts/reddit.model';
import { UserTweetModel } from '../../domain/contracts/twitter.model';
import { PinterestContentModel } from '../../domain/contracts/pinterest.model';
import { InstagramContentModel } from '../../domain/contracts/instagram.model';
import { TikTokContentModel } from '../../domain/contracts/tiktok.model';
import { LinkedInContentModel } from '../../domain/contracts/linkedin.model';
import { SearchCacheService } from './searchCache.service';
import { ApplicationException } from 'core/exceptions';
import configs from '../../configs';
import { IContentStreamIndexService } from '../../domain/services/icontentStreamIndex.service';

@Injectable()
export class SearchService implements ISearchService {
  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    private readonly cacheService: SearchCacheService,
    @Inject(_const.ICONTENTSTREAM_INDEX_SERVICE)
    private readonly contentStreamIndexService: IContentStreamIndexService,
  ) {}

  private readonly channelMetaCache = new ExpiringMemoryCache<
    string,
    {
      name: string;
      username?: string;
      avatar?: string;
      url: string;
    }
  >();

  public async searchFacebookAsync(
    params: PlatformSearchParamsModel,
  ): Promise<FacebookSearchResponseModel> {
    const {
      filters = {},
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const pageToken = paginationToken;

    filters.platform = _const.PLATFORMS.FACEBOOK;

    const cacheParams = {
      platform: _const.PLATFORMS.FACEBOOK,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<FacebookSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getFacebookSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      pageToken,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<FacebookSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreFacebookResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          pageToken,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Facebook results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildFacebookResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  private async fetchFacebookOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number> = {},
    accessToken: string,
    pageToken?: string,
  ): Promise<FacebookAPIResponseModel> {
    const emptyResult = { data: [] };

    if (skipSearch) {
      return emptyResult;
    }

    try {
      const baseUrl = `https://graph.facebook.com/v23.0/search`;

      const params: Record<string, string | number> = {
        q: query,
        type: filters.type || 'posts', // can be page, post, grousp, events
        limit: limit,
        // fields: 'id,name,about,picture{url},category,message',
        access_token: accessToken,
      };

      const response = await axios.get(baseUrl, { params });
      return response.data;
    } catch (error: any) {
      logger.error(
        'Error fetching Facebook data:',
        error?.response?.data || error.message || error,
      );
      return emptyResult;
    }
  }

  // Facebook Search Helper Methods
  private getFacebookSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream:
        filters.type &&
        !['Profile', 'Content', 'Community'].includes(filters.type),
      userContent: true,
      linkedAccount:
        filters.type && !['page', 'group', 'event'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildFacebookResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): FacebookSearchResponseModel {
    const response = new FacebookSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      const mappedContent = mapContentStreamToFacebookOnlineModel(content);
      switch (mappedContent.type) {
        case FacebookOnlineFilters.Posts:
          response.results.posts.data.push(mappedContent);
          break;
        case FacebookOnlineFilters.Pages:
          response.results.pages.data.push(mappedContent);
          break;
        case FacebookOnlineFilters.Groups:
          response.results.groups.data.push(mappedContent);
          break;
        case FacebookOnlineFilters.Events:
          response.results.events.data.push(mappedContent);
          break;
        case FacebookOnlineFilters.People:
          response.results.people.data.push(mappedContent);
          break;
      }
    });

    dbResults.linkedAccount.forEach((account) => {
      const mappedLinkedAccount = mapToFacebookProfileModel(account);
      response.results.accounts.push(mappedLinkedAccount);
    });

    return response;
  }

  private async fetchAndStoreFacebookResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    pageToken?: string,
  ): Promise<void> {
    const fbResults = await this.fetchFacebookOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      pageToken,
    );

    if (!fbResults?.data?.length) return;

    const mappedResults = await Promise.all(
      fbResults.data.map((item) =>
        mapFacebookOnlineResponseToContentStream(item),
      ),
    );

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  public async searchInstagramAsync(
    params: PlatformSearchParamsModel,
  ): Promise<InstagramSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const after = paginationToken;

    filters.platform = _const.PLATFORMS.INSTAGRAM;

    const cacheParams = {
      platform: _const.PLATFORMS.INSTAGRAM,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<InstagramSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getInstagramSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      after,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<InstagramSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreInstagramResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          after,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Instagram results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildInstagramResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchPinterestAsync(
    params: PlatformSearchParamsModel,
  ): Promise<PinterestSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const bookmark = paginationToken;

    filters.platform = _const.PLATFORMS.PINTEREST;

    const cacheParams = {
      platform: _const.PLATFORMS.PINTEREST,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<PinterestSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getPinterestSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      bookmark,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<PinterestSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStorePinterestResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          bookmark,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Pinterest results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildPinterestResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchTwitterAsync(
    params: PlatformSearchParamsModel,
  ): Promise<TwitterSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const nextToken = paginationToken;
    const maxResults = limit;

    filters.platform = _const.PLATFORMS.TWITTER;

    const cacheParams = {
      platform: _const.PLATFORMS.TWITTER,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<TwitterSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getTwitterSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      nextToken,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<TwitterSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreTwitterResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          nextToken,
          maxResults,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Twitter results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildTwitterResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchSpotifyAsync(
    params: PlatformSearchParamsModel,
  ): Promise<SpotifySearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const offset = paginationToken ? parseInt(paginationToken) : undefined;

    filters.platform = _const.PLATFORMS.SPOTIFY;

    const cacheParams = {
      platform: _const.PLATFORMS.SPOTIFY,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<SpotifySearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getSpotifySearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      undefined,
      limit,
    );

    if (shouldFetch) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<SpotifySearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreSpotifyResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          offset,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Spotify results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildSpotifyResponse(originalQuery, dbResults);

    if (shouldFetch) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchRedditAsync(
    params: PlatformSearchParamsModel,
  ): Promise<RedditSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const after = paginationToken;

    filters.platform = _const.PLATFORMS.REDDIT;

    const cacheParams = {
      platform: _const.PLATFORMS.REDDIT,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<RedditSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getRedditSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      after,
      limit,
    );

    if (shouldFetch) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<RedditSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreRedditResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          after,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching Reddit results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildRedditResponse(originalQuery, dbResults);

    if (shouldFetch) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchTiktokAsync(
    params: PlatformSearchParamsModel,
  ): Promise<TiktokSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const cursor = paginationToken;

    filters.platform = _const.PLATFORMS.TIKTOK;

    const cacheParams = {
      platform: _const.PLATFORMS.TIKTOK,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<TiktokSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getTiktokSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      cursor,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<TiktokSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreTiktokResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          cursor,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching TikTok results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildTiktokResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  public async searchYoutubeAsync(
    params: PlatformSearchParamsModel,
  ): Promise<YoutubeSearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const pageToken = paginationToken;

    filters.platform = _const.PLATFORMS.YOUTUBE;

    const cacheParams = {
      platform: _const.PLATFORMS.YOUTUBE,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<YoutubeSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getYoutubeSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      pageToken,
      limit,
    );

    let apiResponse: YouTubeSearchResponseDataType | undefined;

    if (shouldFetch) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<YoutubeSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        apiResponse = await this.fetchAndStoreYouTubeResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          pageToken,
        );
        if (lockAcquired) {
          // After fetching from API, we may have stored many items in contentStream
          // Use full limit for contentStream to ensure we get all fetched items
          // linkedAccount still uses its section limit
          const fullLimitSectionLimits = {
            ...sectionLimits,
            contentStream: limit, // Use full limit for contentStream after API fetch
          };
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            fullLimitSectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching YouTube results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildYoutubeResponse(
      originalQuery,
      dbResults,
      apiResponse,
    );

    if (shouldFetch) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  private getYoutubeSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream:
        filters.type &&
        !['Profile', 'Content', 'Community'].includes(filters.type),
      userContent: true,
      linkedAccount: filters.type && !['channel'].includes(filters.type),
      manualProfile: false,
    };
  }

  private async getDatabaseResults(
    normalizedQuery: string,
    filters: Record<string, any>,
    page: number,
    sectionLimits: any,
    skips: SectionSkipMap,
  ) {
    const [contentStream, linkedAccount] = await Promise.all([
      this.searchContentStreamAsync(skips.contentStream, {
        page,
        filter: filters,
        searchQuery: normalizedQuery,
        pageSize: sectionLimits.contentStream,
      } as QueryOptions),
      this.searchLinkedAccountAsync(skips.linkedAccount, {
        page,
        filter: filters,
        searchQuery: normalizedQuery,
        pageSize: sectionLimits.linkedAccount,
      } as QueryOptions),
    ]);

    return {
      contentStream: contentStream[0],
      linkedAccount: linkedAccount[0],
    };
  }

  private shouldFetchFromAPI(
    dbResults: {
      contentStream: any[];
      linkedAccount: any[];
    },
    forceRefresh: boolean,
    page: number,
    pageToken: string | undefined,
    limit: number,
  ): boolean {
    if (forceRefresh) return true;
    if (page > 1 && !pageToken) return false;

    const totalResults =
      dbResults.contentStream.length + dbResults.linkedAccount.length;
    if (totalResults === 0) return true;

    const allResults = [...dbResults.contentStream, ...dbResults.linkedAccount];
    const staleness = this.getDatabaseStalenessInfo(allResults);

    return staleness.stalePercentage >= 0.3 || totalResults < limit * 0.7;
  }

  private async fetchAndStoreYouTubeResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string | undefined,
    pageToken?: string,
  ): Promise<YouTubeSearchResponseDataType> {
    const ytResults = await this.fetchYouTubeOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      pageToken,
    );

    if (!ytResults?.items?.length) return ytResults;

    const channelMap = await this.fetchYouTubeChannelMetadata(
      ytResults.items.map((i: any) => i.snippet?.channelId).filter(Boolean),
    );

    const videoItems = ytResults.items.filter(
      (i: any) => i.id?.kind === 'youtube#video' && i.id?.videoId,
    );
    const statisticsMap = await this.fetchYouTubeVideoStatistics(
      videoItems.map((i: any) => i.id.videoId),
    );

    const mappedResults = ytResults.items
      .map((item: any) => {
        const kind = item.id?.kind || '';
        let type = 'Content';
        let subType = '';
        let externalId = '';

        if (kind === 'youtube#channel') {
          type = 'Profile';
          subType = 'channel';
          externalId = item.id.channelId || '';
        } else if (kind === 'youtube#video') {
          type = 'Content';
          subType = 'video';
          externalId = item.id.videoId || '';
        } else if (kind === 'youtube#playlist') {
          type = 'Content';
          subType = 'playlist';
          externalId = item.id.playlistId || '';
        }

        const channelId = item.snippet?.channelId;
        const channelMeta = channelId ? channelMap.get(channelId) : undefined;
        const statistics = statisticsMap.get(externalId);

        return new ContentStream({
          type: type as any,
          subType,
          title: item.snippet?.title || '',
          platform: _const.PLATFORMS.YOUTUBE,
          externalId,
          metaData: {
            description: item.snippet?.description,
            publishedAt: item.snippet?.publishedAt,
            thumbnails: item.snippet?.thumbnails,
            channelId: channelId,
            channelTitle: item.snippet?.channelTitle,
            channelName: channelMeta?.name,
            channelUsername: channelMeta?.username,
            channelProfileImage: channelMeta?.avatar,
            channelUrl: channelMeta?.url,
            ...(statistics
              ? {
                  viewCount: Number(statistics.viewCount || 0),
                  likeCount: Number(statistics.likeCount || 0),
                  commentCount: Number(statistics.commentCount || 0),
                  favoriteCount: Number(statistics.favoriteCount || 0),
                  shareCount: null,
                }
              : {}),
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c: ContentStream) => c.externalId);

    if (!mappedResults.length) return ytResults;

    await this.indexSearchResults(mappedResults);

    return ytResults;
  }

  /**
   * Single write path for upstream search results. Every provider's results
   * are indexed through ContentStreamIndexService so they all share the same
   * canonical document (searchText, publishedAt, engagementScore, creatorId).
   * The (platform, externalId) conflict upsert inserts new rows and refreshes
   * existing ones, so no deduplication or explicit refresh is needed here.
   */
  private async indexSearchResults(contents: ContentStream[]): Promise<void> {
    if (contents.length === 0) return;

    try {
      await this.contentStreamIndexService.indexBatch(contents);
    } catch (error) {
      logger.warn(
        `[SearchService] Failed to index content for unified search: ${(error as Error).message}`,
      );
    }
  }

  private async fetchYouTubeChannelMetadata(
    channelIds: string[],
  ): Promise<
    Map<
      string,
      { name: string; username?: string; avatar?: string; url: string }
    >
  > {
    const result = new Map<
      string,
      { name: string; username?: string; avatar?: string; url: string }
    >();
    if (!channelIds.length) return result;

    const uniqueIds = [...new Set(channelIds)];
    const missingIds: string[] = [];

    for (const id of uniqueIds) {
      const cached = this.channelMetaCache.get(id);
      if (cached) {
        result.set(id, cached);
      } else {
        missingIds.push(id);
      }
    }

    if (!missingIds.length) return result;

    try {
      const chunkSize = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < missingIds.length; i += chunkSize) {
        chunks.push(missingIds.slice(i, i + chunkSize));
      }

      const responses = await Promise.all(
        chunks.map((chunk) =>
          axios.get<YoutubeChannelDataType>(
            'https://www.googleapis.com/youtube/v3/channels',
            {
              params: {
                part: 'snippet',
                id: chunk.join(','),
                key: configs.youtube.apiKey,
              },
              timeout: 10000,
            },
          ),
        ),
      );

      for (const response of responses) {
        for (const channel of response.data?.items ?? []) {
          const thumbnails = channel.snippet?.thumbnails;
          const avatar =
            thumbnails?.high?.url ||
            thumbnails?.medium?.url ||
            thumbnails?.default?.url;
          const meta = {
            name: channel.snippet?.title || '',
            username: channel.snippet?.customUrl || undefined,
            avatar: avatar || undefined,
            url: channel.id
              ? `https://www.youtube.com/channel/${channel.id}`
              : '',
          };
          this.channelMetaCache.set(channel.id, meta);
          result.set(channel.id, meta);
        }
      }
    } catch (error: any) {
      logger.error(
        `[SearchService] Failed to fetch YouTube channel metadata:`,
        error?.response?.data || error?.message,
      );
    }

    return result;
  }

  /**
   * Batch-fetch YouTube video statistics for the videos returned by a search.
   * shareCount is not exposed by the YouTube Data API v3, so it is not fetched.
   * Fails safe: on any error the map stays empty and the caller skips enrichment.
   */
  private async fetchYouTubeVideoStatistics(
    videoIds: string[],
  ): Promise<Map<string, Record<string, any>>> {
    const result = new Map<string, Record<string, any>>();
    const uniqueIds = [...new Set(videoIds)].filter(Boolean);
    if (!uniqueIds.length) return result;

    try {
      const chunkSize = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        chunks.push(uniqueIds.slice(i, i + chunkSize));
      }

      const responses = await Promise.all(
        chunks.map((chunk) =>
          axios.get<{
            items?: Array<{ id?: string; statistics?: Record<string, any> }>;
          }>('https://www.googleapis.com/youtube/v3/videos', {
            params: {
              part: 'statistics',
              id: chunk.join(','),
              key: configs.youtube.apiKey,
            },
            timeout: 10000,
          }),
        ),
      );

      for (const response of responses) {
        for (const video of response.data?.items ?? []) {
          if (video?.id && video.statistics) {
            result.set(video.id, video.statistics);
          }
        }
      }
    } catch (error: any) {
      logger.error(
        `[SearchService] Failed to fetch YouTube video statistics:`,
        error?.response?.data || error?.message,
      );
    }

    return result;
  }

  private buildYoutubeResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
    apiResponse?: YouTubeSearchResponseDataType,
  ): YoutubeSearchResponseModel {
    const response = new YoutubeSearchResponseModel();
    response.query = originalQuery;

    if (apiResponse) {
      response.pageInfo = apiResponse.pageInfo;
      response.nextPageToken = apiResponse.nextPageToken;
      response.prevPageToken = apiResponse.prevPageToken;
    }

    dbResults.contentStream.forEach((content) => {
      const item = new YouTubeContentModel();
      item.id = content.id;
      item.title = content.title;
      item.type = content.subType;
      item.externalId = content.externalId;
      item.description = content.metaData?.description;
      item.thumbnailUrl =
        content.metaData?.thumbnailUrl ||
        content.metaData?.thumbnails?.default?.url;
      item.publishedAt = content.metaData?.publishedAt;
      item.videoId = content.metaData?.videoId;
      item.channelId = content.metaData?.channelId;
      item.channelName = content.metaData?.channelName;
      item.channelUsername = content.metaData?.channelUsername;
      item.channelProfileImage = content.metaData?.channelProfileImage;
      item.viewCount = content.metaData?.viewCount;
      item.likeCount = content.metaData?.likeCount;
      item.commentCount = content.metaData?.commentCount;
      item.favoriteCount = content.metaData?.favoriteCount;
      item.shareCount = content.metaData?.shareCount;
      item.duration = content.metaData?.duration;

      response.results.push(item);
    });

    return response;
  }

  private async searchLinkedAccountAsync(
    skipSearch: boolean,
    params: QueryOptions,
  ): Promise<[LinkedAccount[], number]> {
    if (skipSearch) {
      return [[], 0];
    }

    return await this.linkedAccountRepository.getEntriesAsync(params);
  }

  private async searchContentStreamAsync(
    skipSearch: boolean,
    params: QueryOptions,
  ): Promise<[ContentStream[], number]> {
    if (skipSearch) {
      return [[], 0];
    }

    return await this.contenStreamRepository.getEntriesAsync(params);
  }

  private getDatabaseStalenessInfo(
    contents: Array<ContentStream | LinkedAccount>,
  ): { staleCount: number; stalePercentage: number; totalCount: number } {
    if (contents.length === 0) {
      return { staleCount: 0, stalePercentage: 1.0, totalCount: 0 };
    }

    const thresholdTime = new Date(
      Date.now() - _const.SEARCH_CACHE.RESULT_FRESHNESS_WINDOW_MS,
    );
    const staleCount = contents.filter(
      (content) => new Date(content.lastRefreshed) < thresholdTime,
    ).length;

    return {
      staleCount,
      stalePercentage: staleCount / contents.length,
      totalCount: contents.length,
    };
  }

  private async fetchYouTubeOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken: string | undefined,
    pageToken?: string,
  ): Promise<YouTubeSearchResponseDataType> {
    const emptyResult = {
      kind: '',
      etag: '',
      regionCode: '',
      pageInfo: { totalResults: 0, resultsPerPage: 0 },
      items: [],
    };

    if (skipSearch) return emptyResult;

    try {
      const params: Record<string, string | number> = {
        part: 'snippet',
        q: query,
        maxResults: Math.min(Math.max(limit, 1), 50),
        type: filters.type || 'video,channel,playlist',
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (pageToken) params.pageToken = pageToken;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      params.key = configs.youtube.apiKey;

      const response = await axios.get<YouTubeSearchResponseDataType>(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params,
          headers,
          timeout: 10000,
        },
      );

      return response.data || emptyResult;
    } catch (error: any) {
      // const status = error?.response?.status;
      // if (status === 401) throw new ApplicationException('YouTube API authentication failed. Please refresh your token or check your API key.');
      // if (status === 403) throw new ApplicationException('YouTube API access forbidden. Please check your API quota.');
      // if (status === 429) throw new ApplicationException('YouTube API rate limit exceeded. Please try again later.');
      // if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      //   throw new ApplicationException('YouTube API request timeout. Please try again.');
      // }
      logger.error(
        `Error fetching YouTube videos for "${query}":`,
        error?.response?.data || error?.message,
      );
      // throw error;
      return emptyResult;
    }
  }

  // Reddit Search Methods
  private getRedditSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount:
        filters.type && !['user', 'subreddit'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildRedditResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): RedditSearchResponseModel {
    const response = new RedditSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      const item = new RedditContentModel();
      item.id = content.id;
      item.title = content.title;
      item.type = content.subType;
      item.externalId = content.externalId;
      item.subreddit = content.metaData?.subreddit;
      item.author = content.metaData?.author;
      item.score = content.metaData?.score;
      item.upvoteRatio = content.metaData?.upvoteRatio;
      item.numComments = content.metaData?.numComments;
      item.url = content.metaData?.url;
      item.permalink = content.metaData?.permalink;
      item.createdUtc = content.metaData?.createdUtc;
      item.selftext = content.metaData?.selftext;
      item.thumbnail = content.metaData?.thumbnail;

      response.result.content.push(item);
    });

    dbResults.linkedAccount.forEach((account) => {
      const profile = mapToRedditProfileModel(account, false);
      response.result.user.push(profile);
    });

    return response;
  }

  private async fetchAndStoreRedditResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string | undefined,
    after?: string,
  ): Promise<void> {
    const redditResults = await this.fetchRedditOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      after,
    );

    if (!redditResults?.data?.children?.length) return;

    const mappedResults = redditResults.data.children
      .map((item: any) => {
        const data = item.data;
        const kind = data.kind || '';
        let type = 'Content';
        let subType = '';
        let externalId = '';

        if (kind === 't3') {
          type = 'Content';
          subType = 'post';
          externalId = data.id || '';
        } else if (kind === 't5') {
          type = 'Profile';
          subType = 'subreddit';
          externalId = data.display_name || '';
        } else if (kind === 't2') {
          type = 'Profile';
          subType = 'user';
          externalId = data.name || '';
        }

        return new ContentStream({
          type: type as any,
          subType,
          title: data.title || data.display_name || data.name || '',
          platform: _const.PLATFORMS.REDDIT,
          externalId,
          metaData: {
            description: data.selftext || data.public_description || '',
            subreddit: data.subreddit || data.display_name,
            author: data.author,
            score: data.score,
            upvoteRatio: data.upvote_ratio,
            numComments: data.num_comments,
            url: data.url,
            permalink: data.permalink,
            createdUtc: data.created_utc,
            thumbnail: data.thumbnail,
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c) => c.externalId);

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async getRedditAppOnlyTokenAsync(): Promise<string> {
    try {
      const basicAuth = Buffer.from(
        `${configs.reddit.clientId}:${configs.reddit.clientSecret}`,
      ).toString('base64');
      const response = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
            'User-Agent': 'Gaddr/1.0',
          },
        },
      );
      return response.data.access_token;
    } catch (error: any) {
      logger.error(
        'Error getting Reddit app-only token:',
        error?.response?.data || error?.message,
      );
      throw new ApplicationException('Failed to authenticate with Reddit API.');
    }
  }

  private async fetchRedditOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string | undefined,
    after?: string,
  ): Promise<any> {
    if (skipSearch) return { data: { children: [] } };

    try {
      let token = accessToken;
      if (!token) {
        token = await this.getRedditAppOnlyTokenAsync();
      }

      const searchType = filters.type || 'link';
      const params: Record<string, string | number> = {
        q: query,
        limit: Math.min(Math.max(limit, 1), 100),
        sort: filters.sort || 'relevance',
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (after) params.after = after;

      const url = `https://oauth.reddit.com/search.json`;
      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Gaddr/1.0',
        },
        timeout: 10000,
      });

      return response.data || { data: { children: [] } };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'Reddit API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('Reddit API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'Reddit API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'Reddit API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching Reddit results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // Spotify Search Methods
  private getSpotifySearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount: true,
      manualProfile: false,
    };
  }

  private buildSpotifyResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): SpotifySearchResponseModel {
    const response = new SpotifySearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      const type = content.subType as
        'playlist' | 'track' | 'album' | 'show' | 'artist';
      const baseItem = {
        id: content.id,
        name: content.title,
        externalId: content.externalId,
        ...content.metaData,
      };

      switch (type) {
        case 'track': {
          const item = {
            ...baseItem,
            type: 'track',
          } as unknown as SpotifyTrackModel;
          response.result.tracks.push(item);
          break;
        }
        case 'album': {
          const item = {
            ...baseItem,
            type: 'album',
          } as unknown as SpotifyAlbumModel;
          response.result.albums.push(item);
          break;
        }
        case 'playlist': {
          const item = {
            ...baseItem,
            type: 'playlist',
          } as unknown as SpotifyPlaylistModel;
          response.result.playlists.push(item);
          break;
        }
        case 'artist': {
          const item = {
            ...baseItem,
            type: 'artist',
          } as unknown as SpotifyArtistModel;
          response.result.artists.push(item);
          break;
        }
        case 'show': {
          const item = {
            ...baseItem,
            type: 'show',
            showId: content.externalId,
          } as unknown as SpotifyShowModel;
          response.result.shows.push(item);
          break;
        }
      }
    });

    return response;
  }

  private async fetchAndStoreSpotifyResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string | undefined,
    offset?: number,
  ): Promise<void> {
    const spotifyResults = await this.fetchSpotifyOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      offset,
    );

    if (
      !spotifyResults?.tracks?.items?.length &&
      !spotifyResults?.albums?.items?.length &&
      !spotifyResults?.playlists?.items?.length
    )
      return;

    const mappedResults: ContentStream[] = [];

    ['tracks', 'albums', 'playlists', 'artists', 'shows'].forEach((type) => {
      const items = spotifyResults[type]?.items || [];
      items.forEach((item: any) => {
        const externalId = item.id || '';
        if (!externalId) return;

        mappedResults.push(
          new ContentStream({
            type: 'Content' as any,
            subType: type.slice(0, -1),
            title: item.name || '',
            platform: _const.PLATFORMS.SPOTIFY,
            externalId,
            metaData: {
              description: item.description,
              artists: item.artists,
              images: item.images,
              releaseDate: item.release_date,
              popularity: item.popularity,
              ...item,
            },
            lastRefreshed: new Date(),
          }),
        );
      });
    });

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async getSpotifyClientCredentialsTokenAsync(): Promise<string> {
    try {
      const basicAuth = Buffer.from(
        `${configs.spotify.clientId}:${configs.spotify.clientSecret}`,
      ).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );
      return response.data.access_token;
    } catch (error: any) {
      logger.error(
        'Error getting Spotify client credentials token:',
        error?.response?.data || error?.message,
      );
      throw new ApplicationException(
        'Failed to authenticate with Spotify API.',
      );
    }
  }

  private async fetchSpotifyOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string | undefined,
    offset?: number,
  ): Promise<any> {
    if (skipSearch)
      return {
        tracks: { items: [] },
        albums: { items: [] },
        playlists: { items: [] },
      };

    try {
      let token = accessToken;
      if (!token) {
        token = await this.getSpotifyClientCredentialsTokenAsync();
      }

      const params: Record<string, string | number> = {
        q: query,
        type: 'track,album,playlist,artist,show',
        limit: Math.min(Math.max(limit, 1), 50),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (offset !== undefined) params.offset = offset;

      const response = await axios.get('https://api.spotify.com/v1/search', {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return (
        response.data || {
          tracks: { items: [] },
          albums: { items: [] },
          playlists: { items: [] },
        }
      );
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'Spotify API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('Spotify API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'Spotify API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'Spotify API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching Spotify results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // Pinterest Search Methods
  private getPinterestSearchSkips(
    filters: Record<string, any>,
  ): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount: filters.type && !['user'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildPinterestResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): PinterestSearchResponseModel {
    const response = new PinterestSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      const item = new PinterestContentModel();
      item.id = content.id;
      item.title = content.title;
      item.type = content.subType;
      item.externalId = content.externalId;
      item.description = content.metaData?.description;
      item.imageUrl = content.metaData?.imageUrl;
      item.boardId = content.metaData?.boardId;
      item.boardName = content.metaData?.boardName;
      item.link = content.metaData?.link;
      item.createdAt = content.metaData?.createdAt;
      item.pinCount = content.metaData?.pinCount;

      response.result.content.push(item);
    });

    dbResults.linkedAccount.forEach((account) => {
      const profile = mapToPinterestProfileModel(account, false);
      response.result.user.push(profile);
    });

    return response;
  }

  private async fetchAndStorePinterestResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    bookmark?: string,
  ): Promise<void> {
    const pinterestResults = await this.fetchPinterestOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      bookmark,
    );

    if (!pinterestResults?.items?.length) return;

    const mappedResults = pinterestResults.items
      .map((item: any) => {
        const type = item.type || '';
        let subType = '';
        let externalId = '';

        if (type === 'pin') {
          subType = 'pin';
          externalId = item.id || '';
        } else if (type === 'board') {
          subType = 'board';
          externalId = item.id || '';
        }

        return new ContentStream({
          type: 'Content' as any,
          subType,
          title: item.title || item.name || '',
          platform: _const.PLATFORMS.PINTEREST,
          externalId,
          metaData: {
            description: item.description,
            imageUrl: item.media?.images?.['564x']?.url || item.image_cover_url,
            boardId: item.board_id,
            boardName: item.board_name,
            link: item.link,
            createdAt: item.created_at,
            pinCount: item.pin_count,
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c) => c.externalId);

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async fetchPinterestOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    bookmark?: string,
  ): Promise<any> {
    if (skipSearch || !accessToken) return { items: [] };

    try {
      const params: Record<string, string | number> = {
        query,
        limit: Math.min(Math.max(limit, 1), 250),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (bookmark) params.bookmark = bookmark;

      const response = await axios.get(
        'https://api.pinterest.com/v5/search/pins',
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data || { items: [] };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'Pinterest API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('Pinterest API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'Pinterest API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'Pinterest API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching Pinterest results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // TikTok Search Methods
  private getTiktokSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount: filters.type && !['user'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildTiktokResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): TiktokSearchResponseModel {
    const response = new TiktokSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      if (content.subType === 'video') {
        const item = new TikTokContentModel();
        item.id = content.id;
        item.type = content.subType;
        item.url =
          content.metaData?.shareUrl || content.metaData?.embedUrl || '';
        item.createdAt = content.metaData?.createTime
          ? new Date(content.metaData.createTime * 1000)
          : new Date();
        item.mediaUrl = content.metaData?.mediaUrl || '';
        item.thumbnailUrl = content.metaData?.coverImageUrl || '';
        item.caption = content.metaData?.videoDescription || '';
        item.title = content.title;
        item.stats = {
          likes: content.metaData?.likeCount || 0,
          comments: content.metaData?.commentCount || 0,
          shares: content.metaData?.shareCount || 0,
          views: content.metaData?.viewCount || 0,
        };
        item.duration = content.metaData?.videoDuration || 0;
        item.dimensions = {
          height: content.metaData?.height || 0,
          width: content.metaData?.width || 0,
        };

        response.result.content.push(item);
      }
    });

    dbResults.linkedAccount.forEach((account) => {
      const profile = mapToTiktokProfileModel(account, false);
      response.result.user.push(profile);
    });

    response.hasMore = dbResults.contentStream.length >= 25;

    return response;
  }

  private async fetchAndStoreTiktokResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    cursor?: string,
  ): Promise<void> {
    const tiktokResults = await this.fetchTiktokOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      cursor,
    );

    if (!tiktokResults?.data?.videos?.length) return;

    const mappedResults = tiktokResults.data.videos
      .map((item: any) => {
        const externalId = item.video_id || item.id || '';
        if (!externalId) return null;

        return new ContentStream({
          type: 'Content' as any,
          subType: 'video',
          title: item.title || item.video_description || '',
          platform: _const.PLATFORMS.TIKTOK,
          externalId,
          metaData: {
            description: item.video_description,
            coverImageUrl: item.cover_image_url,
            shareUrl: item.share_url,
            duration: item.duration,
            createTime: item.create_time,
            stats: {
              likeCount: item.like_count,
              commentCount: item.comment_count,
              shareCount: item.share_count,
              viewCount: item.view_count,
            },
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c) => c !== null) as ContentStream[];

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async fetchTiktokOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    cursor?: string,
  ): Promise<any> {
    if (skipSearch || !accessToken) return { data: { videos: [] } };

    try {
      const params: Record<string, string | number> = {
        query,
        max_count: Math.min(Math.max(limit, 1), 20),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (cursor) params.cursor = cursor;

      const response = await axios.get(
        'https://open.tiktokapis.com/v2/research/video/query/',
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data || { data: { videos: [] } };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'TikTok API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('TikTok API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'TikTok API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'TikTok API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching TikTok results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // LinkedIn Search Methods
  public async searchLinkedInAsync(
    params: PlatformSearchParamsModel,
  ): Promise<LinkedInSearchResponseModel> {
    const {
      filters = {},
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;
    const start = paginationToken ? parseInt(paginationToken) : undefined;

    filters.platform = _const.PLATFORMS.LINKEDIN;

    const cacheParams = {
      platform: _const.PLATFORMS.LINKEDIN,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<LinkedInSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    const skips = this.getLinkedInSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(
      normalizedQuery,
      filters,
      page,
      sectionLimits,
      skips,
    );

    const shouldFetch = this.shouldFetchFromAPI(
      dbResults,
      forceRefresh,
      page,
      undefined,
      limit,
    );

    if (shouldFetch && accessToken) {
      const lockAcquired = await this.cacheService.acquireLock(cacheParams);

      if (!lockAcquired) {
        const waitingResult =
          await this.cacheService.waitForCachedResults<LinkedInSearchResponseModel>(
            cacheParams,
          );
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreLinkedInResults(
          originalQuery,
          limit,
          filters,
          accessToken,
          start,
        );
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(
            normalizedQuery,
            filters,
            page,
            sectionLimits,
            skips,
          );
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.linkedAccount = updatedResults.linkedAccount;
        }
      } catch (error) {
        logger.error(`Error fetching LinkedIn results:`, error);
      } finally {
        if (lockAcquired) {
          await this.cacheService.releaseLock(cacheParams);
        }
      }
    }

    const response = this.buildLinkedInResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  private getLinkedInSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount:
        filters.type && !['person', 'company'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildLinkedInResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): LinkedInSearchResponseModel {
    const response = new LinkedInSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      if (content.subType === 'post' || content.subType === 'article') {
        const item = new LinkedInContentModel();
        item.id = content.id;
        item.title = content.title;
        item.type = content.subType;
        item.externalId = content.externalId;
        item.text =
          content.metaData?.text?.text ||
          content.metaData?.commentary?.text ||
          content.metaData?.commentary;
        item.commentary = content.metaData?.commentary;
        item.author = content.metaData?.author;
        item.created = content.metaData?.created;
        item.lastModified = content.metaData?.lastModified;
        item.activity = content.metaData?.activity;

        response.result.content.push(item);
      }
    });

    dbResults.linkedAccount.forEach((account) => {
      const accountType =
        account.metaData?.type || account.metaData?.accountType || '';
      const profile = mapToLinkedInProfileModel(account, false);
      if (accountType === 'person') {
        response.result.user.push(profile);
      } else if (accountType === 'company') {
        response.result.companies.push(profile);
      }
    });

    response.count =
      response.result.content.length +
      response.result.user.length +
      response.result.companies.length;

    return response;
  }

  private async fetchAndStoreLinkedInResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    start?: number,
  ): Promise<void> {
    const linkedInResults = await this.fetchLinkedInOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      start,
    );

    if (!linkedInResults?.elements?.length) return;

    const mappedResults = linkedInResults.elements
      .map((item: any) => {
        const type = item.entityUrn?.split(':')[2] || '';
        let subType = '';
        let externalId = '';

        if (type === 'post' || type === 'activity') {
          subType = 'post';
          externalId = item.id || item.entityUrn?.split(':')[3] || '';
        } else if (type === 'person') {
          subType = 'person';
          externalId = item.id || '';
        } else if (type === 'company') {
          subType = 'company';
          externalId = item.id || '';
        }

        return new ContentStream({
          type: 'Content' as any,
          subType,
          title: item.title || item.text?.text || item.headline || '',
          platform: _const.PLATFORMS.LINKEDIN,
          externalId,
          metaData: {
            description: item.summary || item.description,
            text: item.text?.text,
            commentary: item.commentary?.text,
            author: item.author,
            created: item.created,
            lastModified: item.lastModified,
            activity: item.activity,
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c) => c.externalId) as ContentStream[];

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async fetchLinkedInOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    start?: number,
  ): Promise<any> {
    if (skipSearch || !accessToken) return { elements: [] };

    try {
      const params: Record<string, string | number> = {
        q: query,
        count: Math.min(Math.max(limit, 1), 100),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (start !== undefined) params.start = start;

      const response = await axios.get('https://api.linkedin.com/v2/search', {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.data || { elements: [] };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'LinkedIn API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('LinkedIn API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'LinkedIn API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'LinkedIn API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching LinkedIn results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // Instagram Search Helper Methods
  private getInstagramSearchSkips(
    filters: Record<string, any>,
  ): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount:
        filters.type && !['user', 'hashtag'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildInstagramResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): InstagramSearchResponseModel {
    const response = new InstagramSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      const item = new InstagramContentModel();
      item.id = content.id;
      item.title = content.title;
      item.type = content.subType;
      item.externalId = content.externalId;
      item.caption = content.metaData?.caption;
      item.mediaType = content.metaData?.mediaType;
      item.mediaUrl = content.metaData?.mediaUrl;
      item.permalink = content.metaData?.permalink;
      item.thumbnailUrl = content.metaData?.thumbnailUrl;
      item.timestamp = content.metaData?.timestamp;
      item.username = content.metaData?.username;
      item.likeCount = content.metaData?.likeCount;
      item.commentsCount = content.metaData?.commentsCount;

      response.result.content.push(item);
    });

    dbResults.linkedAccount.forEach((account) => {
      const profile = mapToInstagramProfileModel(account, false);
      response.result.user.push(profile);
    });

    return response;
  }

  private async fetchAndStoreInstagramResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    after?: string,
  ): Promise<void> {
    const instagramResults = await this.fetchInstagramOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      after,
    );

    if (!instagramResults?.data?.length) return;

    const mappedResults = instagramResults.data
      .map((item: any) => {
        const type = item.type || '';
        let subType = '';
        let externalId = '';

        if (type === 'media' || type === 'post') {
          subType = 'media';
          externalId = item.id || '';
        } else if (type === 'hashtag') {
          subType = 'hashtag';
          externalId = item.id || item.name || '';
        } else if (type === 'user') {
          subType = 'user';
          externalId = item.id || item.username || '';
        }

        return new ContentStream({
          type: 'Content' as any,
          subType,
          title: item.caption || item.name || item.username || '',
          platform: _const.PLATFORMS.INSTAGRAM,
          externalId,
          metaData: {
            caption: item.caption,
            mediaType: item.media_type,
            mediaUrl: item.media_url,
            permalink: item.permalink,
            thumbnailUrl: item.thumbnail_url,
            timestamp: item.timestamp,
            username: item.username,
            likeCount: item.like_count,
            commentsCount: item.comments_count,
          },
          lastRefreshed: new Date(),
        });
      })
      .filter((c) => c.externalId) as ContentStream[];

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async fetchInstagramOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    after?: string,
  ): Promise<any> {
    if (skipSearch || !accessToken) return { data: [] };

    try {
      const params: Record<string, string | number> = {
        q: query,
        type: filters.type || 'hashtag,user',
        limit: Math.min(Math.max(limit, 1), 100),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (after) params.after = after;

      const response = await axios.get(
        `https://graph.instagram.com/v23.0/ig_hashtag_search`,
        {
          params: { user_id: query, access_token: accessToken },
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return { data: response.data?.data || [] };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'Instagram API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('Instagram API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'Instagram API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'Instagram API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching Instagram results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // Twitter Search Helper Methods
  private getTwitterSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: false,
      userContent: true,
      linkedAccount: filters.type && !['user'].includes(filters.type),
      manualProfile: false,
    };
  }

  private buildTwitterResponse(
    originalQuery: string,
    dbResults: {
      contentStream: ContentStream[];
      linkedAccount: LinkedAccount[];
    },
  ): TwitterSearchResponseModel {
    const response = new TwitterSearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach((content) => {
      if (content.subType === 'tweet') {
        const item: UserTweetModel = {
          id: content.id,
          type: 'tweet',
          name: content.title,
          tweetId: content.externalId,
          tweet: content.metaData?.text || '',
          editHistoryTweetIds: content.metaData?.editHistoryTweetIds || [],
        };
        response.result.content.push(item);
      }
    });

    dbResults.linkedAccount.forEach((account) => {
      const profile = mapToTwitterProfileModel(account, false);
      response.result.user.push(profile);
    });

    response.resultCount =
      response.result.content.length + response.result.user.length;

    return response;
  }

  private async fetchAndStoreTwitterResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    nextToken?: string,
    maxResults?: number,
  ): Promise<void> {
    const twitterResults = await this.fetchTwitterOnlineAsync(
      false,
      query,
      limit,
      filters,
      accessToken,
      nextToken,
      maxResults,
    );

    if (
      !twitterResults?.data?.length &&
      !twitterResults?.includes?.users?.length
    )
      return;

    const mappedResults: ContentStream[] = [];

    if (twitterResults.data) {
      twitterResults.data.forEach((item: any) => {
        const externalId = item.id || '';
        if (!externalId) return;

        mappedResults.push(
          new ContentStream({
            type: 'Content' as any,
            subType: 'tweet',
            title: item.text || '',
            platform: _const.PLATFORMS.TWITTER,
            externalId,
            metaData: {
              text: item.text,
              authorId: item.author_id,
              createdAt: item.created_at,
              editHistoryTweetIds: item.edit_history_tweet_ids,
              publicMetrics: item.public_metrics,
              ...item,
            },
            lastRefreshed: new Date(),
          }),
        );
      });
    }

    if (!mappedResults.length) return;

    await this.indexSearchResults(mappedResults);
  }

  private async fetchTwitterOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    nextToken?: string,
    maxResults?: number,
  ): Promise<any> {
    if (skipSearch || !accessToken) return { data: [] };

    try {
      const params: Record<string, string | number> = {
        query,
        max_results: maxResults || Math.min(Math.max(limit, 1), 100),
        ...filters,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] == null) delete params[key];
      });

      if (nextToken) params.next_token = nextToken;

      const response = await axios.get(
        'https://api.twitter.com/2/tweets/search/recent',
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data || { data: [] };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401)
        throw new ApplicationException(
          'Twitter API authentication failed. Please refresh your token.',
        );
      if (status === 403)
        throw new ApplicationException('Twitter API access forbidden.');
      if (status === 429)
        throw new ApplicationException(
          'Twitter API rate limit exceeded. Please try again later.',
        );
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException(
          'Twitter API request timeout. Please try again.',
        );
      }
      logger.error(
        `Error fetching Twitter results for "${query}":`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // Snapchat Search Methods
  public async searchSnapchatAsync(
    params: PlatformSearchParamsModel,
  ): Promise<SnapchatSearchResponseModel> {
    const {
      filters = {},
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;

    filters.platform = _const.PLATFORMS.SNAPCHAT;

    const cacheParams = {
      platform: _const.PLATFORMS.SNAPCHAT,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<SnapchatSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    // Snapchat API has limited availability - using fallback logic
    const response = new SnapchatSearchResponseModel();
    response.query = originalQuery;
    response.result = {
      user: [],
      content: [],
    };

    await this.cacheService.getCachedResults(cacheParams);
    return response;
  }

  // Threads Search Methods
  public async searchThreadsAsync(
    params: PlatformSearchParamsModel,
  ): Promise<ThreadsSearchResponseModel> {
    const {
      filters = {},
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;

    filters.platform = _const.PLATFORMS.THREADS;

    const cacheParams = {
      platform: _const.PLATFORMS.THREADS,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<ThreadsSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    // Note: Threads API not yet available - placeholder implementation
    const response = new ThreadsSearchResponseModel();
    response.query = originalQuery;
    response.result = {
      user: [],
      content: [],
    };

    await this.cacheService.getCachedResults<ThreadsSearchResponseModel>(
      cacheParams,
    );
    return response;
  }

  // Behance Search Methods
  public async searchBehanceAsync(
    params: PlatformSearchParamsModel,
  ): Promise<BehanceSearchResponseModel> {
    const {
      filters = {},
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      paginationToken,
      page,
      forceRefresh = false,
    } = params;

    filters.platform = _const.PLATFORMS.BEHANCE;

    const cacheParams = {
      platform: _const.PLATFORMS.BEHANCE,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.cacheService.getCachedResults<BehanceSearchResponseModel>(
          cacheParams,
        );
      if (cached) return cached;
    }

    // Since Behance has no official API, using fallback logic
    const response = new BehanceSearchResponseModel();
    response.query = originalQuery;
    response.result = {
      user: [],
      content: [],
    };

    await this.cacheService.getCachedResults<BehanceSearchResponseModel>(
      cacheParams,
    );
    return response;
  }
}
