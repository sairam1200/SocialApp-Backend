import axios from "axios";
import _const from "../../core/utils/const";
import logger from "../../core/utils/winston.util";
import { Inject, Injectable } from "@nestjs/common";
import { ContentStream, LinkedAccount, UserContent } from "../../domain/entities";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { ISearchService } from "../../domain/services/isearch.service";
import limitAllocatorUtil, { SectionSkipMap } from "../../core/utils/limitAllocator.util";
import { YouTubeSearchParamsModel, YouTubeSearchResponseModel } from "../../domain/contracts/youtube.model";
import { IContentStreamRepository, ILinkedAccountRepository, IUserContentRepository } from "../../domain/repositories";

@Injectable()
export class SearchService implements ISearchService {

  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async searchFacebookAsync(access_token: string): Promise<any> {

    return;
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

  public async searchYoutubeAsync(params: YouTubeSearchParamsModel): Promise<any> {

    const { filters, limit, normalizedQuery, originalQuery, accessToken, pageToken, page } = params;

    if (!filters?.platform || filters.platform !== _const.PLATFORMS.YOUTUBE) {
      filters.platform = _const.PLATFORMS.YOUTUBE;
    }

    const skipUserContentSearch = filters.type && !['video', 'playlist'].includes(filters.type);
    const skipLinkedAccountSearch = filters.type && !['channel'].includes(filters.type);
    const skipOnlineSearch = page > 1 && !pageToken;

    const skips: SectionSkipMap = {
      contentStream: false,
      userContent: skipUserContentSearch,
      linkedAccount: skipLinkedAccountSearch,
      online: false
    };

    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);

    const [contentStreamResults, userContentResults, linkedAccountResults, ytOnlineResults] = await Promise.all([
      this.searchContentStreamAsync(false, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.contentStream } as QueryOptions),
      this.searchUserContentAsync(skipUserContentSearch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.userContent } as QueryOptions),
      this.searchLinkedAccountAsync(skipLinkedAccountSearch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.linkedAccount } as QueryOptions),
      this.fetchYouTubeVideos(skipOnlineSearch, originalQuery, sectionLimits.online, filters, accessToken)
    ]);

    if (contentStreamResults[0].length !== 0) {

    }

    if (userContentResults[0].length !== 0) {

    }

    if (linkedAccountResults[0].length !== 0) {

    }

    if (ytOnlineResults.items.length !== 0) {

    }
  }

  private async searchLinkedAccountAsync(skipSearch: boolean, params: QueryOptions): Promise<[LinkedAccount[], number]> {

    if (skipSearch) {
      return [[], 0]
    }

    return await this.linkedAccountRepository.getEntriesAsync(params);
  }

  private async searchUserContentAsync(skipSearch: boolean, params: QueryOptions): Promise<[UserContent[], number]> {

    if (skipSearch) {
      return [[], 0]
    }

    return await this.userContentRepository.getEntriesAsync(params);
  }

  private async searchContentStreamAsync(skipSearch: boolean, params: QueryOptions): Promise<[ContentStream[], number]> {

    if (skipSearch) {
      return [[], 0]
    }

    return await this.contenStreamRepository.getEntriesAsync(params);
  }

  private async fetchYouTubeVideos(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number> = {},
    accessToken: string,
    pageToken?: string,
  ): Promise<YouTubeSearchResponseModel> {

    const emptyResult = { kind: '', etag: '', regionCode: '', pageInfo: { totalResults: 0, resultsPerPage: 0, }, items: [] };
    if (skipSearch) {
      return emptyResult;
    }

    try {
      const baseUrl = 'https://www.googleapis.com/youtube/v3/search';

      const params: Record<string, string | number> = {
        part: 'snippet',
        q: query,
        maxResults: limit,
        ...filters,
      };

      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await axios.get<YouTubeSearchResponseModel>(baseUrl, {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching YouTube videos:', error?.response?.data || error.message || error);

      return emptyResult;
    }
  }

}