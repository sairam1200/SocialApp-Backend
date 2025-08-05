import axios from "axios";
import _const from "../../core/utils/const";
import fuseUtil from "../../core/utils/fuse.util";
import logger from "../../core/utils/winston.util";
import { Inject, Injectable } from "@nestjs/common";
import { ISearchService } from "../../domain/services/isearch.service";
import { YouTubeSearchResponseModel } from "../../domain/contracts/youtube.model";
import { IContentStreamRepository, ISearchHistoryRepository, IUserContentRepository } from "../../domain/repositories";

@Injectable()
export class SearchService implements ISearchService {

  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
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

  public async searchYoutubeAsync(
    searchTerm: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken?: string
  ): Promise<any> {


    let normalizedQuery = await this.normalizeQuery(searchTerm);
    // TODO: figure out when to save the query

    const ytResponse = await this.fetchYouTubeVideos(normalizedQuery, limit, filters, accessToken);
  }

  private async fetchYouTubeVideos(
    query: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken: string
  ): Promise<YouTubeSearchResponseModel> {
    try {
      const baseUrl = 'https://www.googleapis.com/youtube/v3/search';

      const response = await axios.get<YouTubeSearchResponseModel>(baseUrl, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: limit,
          ...filters,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching YouTube videos:', error);

      return {
        kind: '',
        etag: '',
        regionCode: '',
        pageInfo: {
          totalResults: 0,
          resultsPerPage: 0,
        },
        items: [],
      };
    }
  }

  private async normalizeQuery(query: string): Promise<string> {

    const searchHistory = await this.searchHistoryRepository.findSimilarQueriesAsync(query);
    if (searchHistory.length > 0) {
      const queries = searchHistory.map(item => item.normalizedQuery);
      return fuseUtil.normalizeSearchTerm(query, queries);
    }

    return fuseUtil.normalizeSearchTerm(query, []);
  }

}