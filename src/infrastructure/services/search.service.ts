import axios from 'axios';
import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ContentStream,
  LinkedAccount,
  UserContent,
} from '../../domain/entities';
import { QueryOptions } from '../../domain/types/queryOptions.type';
import { ISearchService } from '../../domain/services/isearch.service';
import limitAllocatorUtil, {
  SectionSkipMap,
} from '../../core/utils/limitAllocator.util';
import {
  SearchResponseModel,
  YouTubeSearchParamsModel,
  YouTubeSearchResponseModel,
} from '../../domain/contracts/youtube.model';
import {
  ILinkedAccountRepository,
  IUserContentRepository,
} from '../../domain/repositories';
import { IContentStreamRepository } from '../../domain/repositories/icontentStream.repository';
import { mapToLinkedInProfileModel } from 'domain/mappers/linkedin.mapper';
import {
  YouTubeUserContentFilters,
  YouTubeOnlineFilters,
  FacebookOnlineFilters,
  FacebookUserContentFilters,
} from 'domain/enums';
import { IGeneralRepository } from 'domain/repositories/igeneral.repository';
import {
  FacebookAPIResponseModel,
  FacebookSearchParamsModel,
  FacebookSearchResponseModel,
} from 'domain/contracts/facebook.model';
import {
  mapContentStreamToFacebookOnlineModel,
  mapFacebookOnlineResponseToContentStream,
  mapToFacebookOnlineModel,
  mapToFacebookProfileModel,
} from 'domain/mappers/facebook.mapper';
import { SearchCacheService } from './searchCache.service';
import { ApplicationException } from 'core/exceptions';

@Injectable()
export class SearchService implements ISearchService {
  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IGENERAL_REPOSITORY)
    private readonly generalRepository: IGeneralRepository,
    private readonly cacheService: SearchCacheService,
  ) { }

  public async searchFacebookAsync(
    params: FacebookSearchParamsModel,
  ): Promise<FacebookSearchResponseModel> {
    const response = new FacebookSearchResponseModel();
    response.query = params.originalQuery;

    console.log("Facebook params:", params);

    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      pageToken,
      page,
    } = params;

    if (!filters?.platform || filters.platform !== _const.PLATFORMS.FACEBOOK) {
      filters.platform = _const.PLATFORMS.FACEBOOK;
    }

    const skipContentStreamSearch =
      filters.type &&
      !['Profile', 'Content', 'Community'].includes(filters.type);
    const skipUserContentSearch =
      filters.type && !['feed', 'likes', 'video'].includes(filters.type);
    const skipLinkedAccountSearch =
      filters.type && !['page', 'group', 'event'].includes(filters.type);
    const skipOnlineSearch = page > 1 && !pageToken;

    const skips: SectionSkipMap = {
      contentStream: skipContentStreamSearch,
      userContent: skipUserContentSearch,
      linkedAccount: skipLinkedAccountSearch,
      manualProfile: false,
    };

    // Fetch data from Facebook Graph API
    const fbOnlineResults = await this.fetchFacebookOnlineAsync(
      skipOnlineSearch,
      normalizedQuery,
      limit,
      filters,
      accessToken,
    );

    // Map Facebook results into ContentStream entities
    const mappedFbOnlineResults = await Promise.all(
      fbOnlineResults.data.map((item) =>
        mapFacebookOnlineResponseToContentStream(item),
      ),
    );

    // Check which ones are new
    const fbOnlineExternalIds = mappedFbOnlineResults.map(
      (content) => content.externalId,
    );

    const listIds = await this.generalRepository.checkExistingItemsAsync(
      fbOnlineExternalIds,
      _const.PLATFORMS.FACEBOOK,
    );

    const newContents = mappedFbOnlineResults.filter((content) =>
      listIds.includes(content.externalId),
    );

    // Insert new contents if any
    if (newContents.length > 0) {
      const result = await this.generalRepository.createAsync(newContents);
    }

    // Allocate section limits
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);

    // Fetch local results from DB (contentStreams, userContents, linkedAccounts)
    const [contentStreamResults, userContentResults, linkedAccountResults] =
      await Promise.all([
        this.searchContentStreamAsync(skipContentStreamSearch, {
          page,
          filter: filters,
          searchQuery: normalizedQuery,
          pageSize: sectionLimits.contentStream,
        } as QueryOptions),
        this.searchUserContentAsync(skipUserContentSearch, {
          page,
          filter: filters,
          searchQuery: normalizedQuery,
          pageSize: sectionLimits.userContent,
        } as QueryOptions),
        this.searchLinkedAccountAsync(skipLinkedAccountSearch, {
          page,
          filter: filters,
          searchQuery: normalizedQuery,
          pageSize: sectionLimits.linkedAccount,
        } as QueryOptions),
      ]);

    // Process content stream results
    if (contentStreamResults[0].length !== 0) {

      contentStreamResults[0].forEach((content: ContentStream) => {
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
    }

    // Process user content results
    if (userContentResults[0].length > 0) {
      userContentResults[0].forEach((content: UserContent) => {
        switch (content.type) {
          case FacebookUserContentFilters.Feed:
            response.results.feeds.data.push(content);
            break;
          case FacebookUserContentFilters.Posts:
            response.results.posts.data.push(content);
            break;
          case FacebookUserContentFilters.Likes:
            response.results.likes.data.push(content);
            break;
          case FacebookUserContentFilters.Groups:
            response.results.groups.data.push(content);
            break;
          case FacebookUserContentFilters.Events:
            response.results.events.data.push(content);
            break;
          case FacebookUserContentFilters.Videos:
            response.results.videos.data.push(content);
            break;
          default:
            break;
        }
      });
    }

    // Process linked account results
    if (linkedAccountResults[0].length !== 0) {

      linkedAccountResults[0].forEach((account: LinkedAccount) => {
        const mappedLinkedAccount = mapToFacebookProfileModel(account);
        response.results.accounts.push(mappedLinkedAccount);
      });
    }

    //  Merge new online data into response
    // if (fbOnlineResults?.data?.length > 0) {
    //   fbOnlineResults.data.forEach((item) => {
    //     const exists = response.results.posts.data.find(
    //       (p) => p.id === item.id,
    //     );
    //     if (!exists) {
    //       response.results.posts.data.push(item);
    //     }
    //   });
    // }

    // Assign paging info from Facebook API
    // response.results.posts.paging = fbOnlineResults.paging;

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

  public async searchInstagramAsync(access_token: string): Promise<any> {
    return;
  }

  public async searchPinterestAsync(access_token: string): Promise<any> {
    return;
  }

  public async searchTwitterAsync(access_token: string): Promise<any> {
    return;
  }

  public async searchSpotifyAsync(access_token: string): Promise<any> {
    return;
  }

  public async searchYoutubeAsync(
    params: YouTubeSearchParamsModel,
  ): Promise<SearchResponseModel> {
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      pageToken,
      page,
      forceRefresh = false,
    } = params;

    filters.platform = _const.PLATFORMS.YOUTUBE;

    const cacheParams = {
      platform: _const.PLATFORMS.YOUTUBE,
      normalizedQuery,
      filters,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached = await this.cacheService.getCachedResults<SearchResponseModel>(cacheParams);
      if (cached) return cached;
    }

    const skips = this.getYoutubeSearchSkips(filters);
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    const dbResults = await this.getDatabaseResults(normalizedQuery, filters, page, sectionLimits, skips);

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
        const waitingResult = await this.cacheService.waitForCachedResults<SearchResponseModel>(cacheParams);
        if (waitingResult) return waitingResult;
      }

      try {
        await this.fetchAndStoreYouTubeResults(originalQuery, limit, filters, accessToken, pageToken);
        if (lockAcquired) {
          const updatedResults = await this.getDatabaseResults(normalizedQuery, filters, page, sectionLimits, skips);
          dbResults.contentStream = updatedResults.contentStream;
          dbResults.userContent = updatedResults.userContent;
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

    const response = this.buildYoutubeResponse(originalQuery, dbResults);

    if (shouldFetch && accessToken) {
      await this.cacheService.setCachedResults(cacheParams, response);
    }

    return response;
  }

  private getYoutubeSearchSkips(filters: Record<string, any>): SectionSkipMap {
    return {
      contentStream: filters.type && !['Profile', 'Content', 'Community'].includes(filters.type),
      userContent: filters.type && !['video', 'playlist'].includes(filters.type),
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
    const [contentStream, userContent, linkedAccount] = await Promise.all([
      this.searchContentStreamAsync(skips.contentStream, {
        page,
        filter: filters,
        searchQuery: normalizedQuery,
        pageSize: sectionLimits.contentStream,
      } as QueryOptions),
      this.searchUserContentAsync(skips.userContent, {
        page,
        filter: filters,
        searchQuery: normalizedQuery,
        pageSize: sectionLimits.userContent,
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
      userContent: userContent[0],
      linkedAccount: linkedAccount[0],
    };
  }

  private shouldFetchFromAPI(
    dbResults: { contentStream: any[]; userContent: any[]; linkedAccount: any[] },
    forceRefresh: boolean,
    page: number,
    pageToken: string | undefined,
    limit: number,
  ): boolean {
    if (forceRefresh) return true;
    if (page > 1 && !pageToken) return false;

    const totalResults = dbResults.contentStream.length + dbResults.userContent.length + dbResults.linkedAccount.length;
    if (totalResults === 0) return true;

    const allResults = [...dbResults.contentStream, ...dbResults.userContent, ...dbResults.linkedAccount];
    const staleness = this.getDatabaseStalenessInfo(allResults);

    return staleness.stalePercentage >= 0.3 || totalResults < limit * 0.7;
  }

  private async fetchAndStoreYouTubeResults(
    query: string,
    limit: number,
    filters: Record<string, any>,
    accessToken: string,
    pageToken?: string,
  ): Promise<void> {
    const ytResults = await this.fetchYouTubeOnlineAsync(false, query, limit, filters, accessToken, pageToken);

    if (!ytResults?.items?.length) return;

    const mappedResults = ytResults.items.map(item => {
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
          channelId: item.snippet?.channelId,
          channelTitle: item.snippet?.channelTitle,
        },
        lastRefreshed: new Date(),
      });
    }).filter(c => c.externalId);

    if (!mappedResults.length) return;

    const externalIds = mappedResults.map(c => c.externalId);
    const newIds = await this.generalRepository.checkExistingItemsAsync(externalIds, _const.PLATFORMS.YOUTUBE);
    const toAdd = mappedResults.filter(c => newIds.includes(c.externalId));
    const existingIds = externalIds.filter(id => !newIds.includes(id));

    if (toAdd.length > 0) {
      await this.generalRepository.createAsync(toAdd);
    }

    if (existingIds.length > 0) {
      await this.updateContentRefreshTimestamp(existingIds, _const.PLATFORMS.YOUTUBE);
    }
  }

  private buildYoutubeResponse(
    originalQuery: string,
    dbResults: { contentStream: ContentStream[]; userContent: UserContent[]; linkedAccount: LinkedAccount[] },
  ): SearchResponseModel {
    const response = new SearchResponseModel();
    response.query = originalQuery;

    dbResults.contentStream.forEach(content => {
      const item = {
        id: content.id,
        externalId: content.externalId,
        title: content.title,
        type: content.subType,
        ...content.metaData,
      };

      if (content.subType === 'channel' || content.subType === YouTubeOnlineFilters.Channals) {
        response.results.channels.push(item);
      } else if (content.subType === 'video' || content.subType === YouTubeOnlineFilters.Videos) {
        response.results.videos.push(item);
      } else if (content.subType === 'playlist' || content.subType === YouTubeOnlineFilters.Playlists) {
        response.results.playlist.push(item);
      }
    });

    dbResults.userContent.forEach(content => {
      const item = {
        id: content.id,
        externalId: content.externalId,
        title: content.title,
        type: content.type,
        ...content.metaData,
      };

      switch (content.type) {
        case YouTubeUserContentFilters.Channals:
          response.results.channels.push(item);
          break;
        case YouTubeUserContentFilters.Videos:
          response.results.videos.push(item);
          break;
        case YouTubeUserContentFilters.Playlists:
          response.results.playlist.push(item);
          break;
        case YouTubeUserContentFilters.Activities:
          response.results.activities.push(item);
          break;
        case YouTubeUserContentFilters.PlaylistVideos:
          response.results.playlistVideo.push(item);
          break;
        case YouTubeUserContentFilters.Subscriptions:
          response.results.subscriptions.push(item);
          break;
      }
    });

    dbResults.linkedAccount.forEach(account => {
      response.results.accounts.push(mapToLinkedInProfileModel(account));
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

  private async searchUserContentAsync(
    skipSearch: boolean,
    params: QueryOptions,
  ): Promise<[UserContent[], number]> {
    if (skipSearch) {
      return [[], 0];
    }

    return await this.userContentRepository.getEntriesAsync(params);
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
    contents: Array<ContentStream | UserContent | LinkedAccount>,
  ): { staleCount: number; stalePercentage: number; totalCount: number } {
    if (contents.length === 0) {
      return { staleCount: 0, stalePercentage: 1.0, totalCount: 0 };
    }

    const thresholdTime = new Date(Date.now() - _const.SEARCH_CACHE.RESULT_FRESHNESS_WINDOW_MS);
    const staleCount = contents.filter(
      content => new Date(content.lastRefreshed) < thresholdTime
    ).length;

    return {
      staleCount,
      stalePercentage: staleCount / contents.length,
      totalCount: contents.length,
    };
  }

  private async updateContentRefreshTimestamp(
    externalIds: string[],
    platform: string,
  ): Promise<void> {
    if (externalIds.length === 0) return;

    try {
      await this.generalRepository.updateContentRefreshTimestampAsync(externalIds, platform);
    } catch (error) {
      logger.error(`Error updating lastRefreshed for ${platform}:`, error);
    }
  }

  private async fetchYouTubeOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken: string,
    pageToken?: string,
  ): Promise<YouTubeSearchResponseModel> {
    const emptyResult = {
      kind: '',
      etag: '',
      regionCode: '',
      pageInfo: { totalResults: 0, resultsPerPage: 0 },
      items: [],
    };

    if (skipSearch || !accessToken) return emptyResult;

    try {
      const params: Record<string, string | number> = {
        part: 'snippet',
        q: query,
        maxResults: Math.min(Math.max(limit, 1), 50),
        type: filters.type || 'video,channel,playlist',
        ...filters,
      };

      Object.keys(params).forEach(key => {
        if (params[key] == null) delete params[key];
      });

      if (pageToken) params.pageToken = pageToken;

      const response = await axios.get<YouTubeSearchResponseModel>(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data || emptyResult;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) throw new ApplicationException('YouTube API authentication failed. Please refresh your token.');
      if (status === 403) throw new ApplicationException('YouTube API access forbidden. Please check your API quota.');
      if (status === 429) throw new ApplicationException('YouTube API rate limit exceeded. Please try again later.');
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new ApplicationException('YouTube API request timeout. Please try again.');
      }
      logger.error(`Error fetching YouTube videos for "${query}":`, error?.response?.data || error?.message);
      throw error;
    }
  }
}
