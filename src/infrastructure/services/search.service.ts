import axios from "axios";
import _const from "../../core/utils/const";
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
    originalQuery: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken?: string
  ): Promise<any> {


    // TODO: figure out when to save the query
    const ytResponse = await this.fetchYouTubeVideos(originalQuery, limit, filters, accessToken);
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

}