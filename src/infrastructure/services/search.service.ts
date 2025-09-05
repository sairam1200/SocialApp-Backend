import axios from "axios";
import { Queue } from "bullmq";
import { InjectQueue } from "@nestjs/bullmq";
import _const from "../../core/utils/const";
import logger from "../../core/utils/winston.util";
import { Inject, Injectable } from "@nestjs/common";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { ISearchService } from "../../domain/services/isearch.service";
import { mapToLinkedInProfileModel } from "../../domain/mappers/linkedin.mapper";
import { YouTubeUserContentFilters, YouTubeOnlineFilters } from "../../domain/enums";
import limitAllocatorUtil, { SectionSkipMap } from "../../core/utils/limitAllocator.util";
import { ContentStream, LinkedAccount, ManualProfile, UserContent } from "../../domain/entities";
import { SearchResponseModel, YouTubeSearchParamsModel, YouTubeSearchResponseModel } from "../../domain/contracts/youtube.model";
import { IContentStreamRepository, ILinkedAccountRepository, IManualProfileRepository, IUserContentRepository } from "../../domain/repositories";
import { mapContentStreamToYouTubeOnlineModel, mapToYoutubeActivityModel, mapToYoutubeChannelInfoModel, mapToYoutubeOnlineModel, mapToYoutubePlaylisVideoModel, mapToYoutubePlaylistModel, mapToYoutubeSubscriptionsModel, mapToYoutubeUploadedVideosModel } from "domain/mappers/youtube.mapper";

@Injectable()
export class SearchService implements ISearchService {

  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,

    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,

    @InjectQueue(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT)
    private readonly contentStreamImportQueue: Queue,
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

  public async searchYoutubeAsync(params: YouTubeSearchParamsModel): Promise<SearchResponseModel> {
    const response = new SearchResponseModel();
    const { filters, limit, normalizedQuery, originalQuery, accessToken, pageToken, page } = params;

    response.query = originalQuery

    if (!filters?.platform || filters.platform !== _const.PLATFORMS.YOUTUBE) {
      filters.platform = _const.PLATFORMS.YOUTUBE;
    }

    const skipContentStreamSerch = filters.type && !["Profile", "Content", "Community"].includes(filters.type)
    const skipUserContentSearch = filters.type && !['video', 'playlist'].includes(filters.type);
    const skipLinkedAccountSearch = filters.type && !['channel'].includes(filters.type);
    const skipManualProfileSearch = filters.type && !['manualProfile'].includes(filters.type);
    const skipOnlineSearch = page > 1 && !pageToken;

    const skips: SectionSkipMap = {
      contentStream: skipContentStreamSerch,
      userContent: skipUserContentSearch,
      linkedAccount: skipLinkedAccountSearch,
      manualProfile: skipManualProfileSearch,
      online: false
    };

    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);

    const [contentStreamResults, userContentResults, linkedAccountResults, manualProfileResult, ytOnlineResults] = await Promise.all([
      this.searchContentStreamAsync(skipContentStreamSerch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.contentStream } as QueryOptions),
      this.searchUserContentAsync(skipUserContentSearch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.userContent } as QueryOptions),
      this.searchLinkedAccountAsync(skipLinkedAccountSearch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.linkedAccount } as QueryOptions),
      this.searchManualProfileAsync(skipManualProfileSearch, { page, filter: filters, searchQuery: normalizedQuery, pageSize: sectionLimits.manualProfile } as QueryOptions),
      this.fetchYouTubeOnlineAsync(skipOnlineSearch, originalQuery, limit, filters, accessToken)
    ]);


    if (contentStreamResults[0].length !== 0) {
      contentStreamResults[0].forEach((content: ContentStream) => {
        const mappedContent = mapContentStreamToYouTubeOnlineModel(content)
        switch (mappedContent.type) {
          case YouTubeOnlineFilters.Channals:
            response.results.channels.push(mappedContent);
            // console.log("channel added from online",content)
            break;
          case YouTubeOnlineFilters.Videos:
            response.results.videos.push(mappedContent);
            // console.log("video added from online",content)
            break;
          case YouTubeOnlineFilters.Playlists:
            response.results.playlist.push(mappedContent);
            // console.log("playlist added from online",content)
            break;
          default:
            break;
        }
      })
    }

    if (userContentResults[0].length > 0) {
      userContentResults[0].forEach((content: UserContent) => {
        switch (content.type) {
          case YouTubeUserContentFilters.Channals:
            response.results.channels.push(mapToYoutubeChannelInfoModel(content));
            break;
          case YouTubeUserContentFilters.Videos:
            response.results.videos.push(mapToYoutubeUploadedVideosModel(content));
            break;
          case YouTubeUserContentFilters.Playlists:
            response.results.playlist.push(mapToYoutubePlaylistModel(content));
            break;
          case YouTubeUserContentFilters.Activities:
            response.results.activities.push(mapToYoutubeActivityModel(content));
            break;
          case YouTubeUserContentFilters.PlaylistVideos:
            response.results.playlistVideo.push(mapToYoutubePlaylisVideoModel(content));
            break;
          case YouTubeUserContentFilters.Subscriptions:
            const results = mapToYoutubeSubscriptionsModel(content)
            //console.log("Mapped Subscription: ", results)
            response.results.subscriptions.push(results);
            break;
          default:
            //console.warn(`Unknown content type: ${content.type}`);
            break;
        }
      })
    }

    if (linkedAccountResults[0].length !== 0) {
      linkedAccountResults[0].forEach((account: LinkedAccount) => {
        const mappedLinkedAccount = mapToLinkedInProfileModel(account)
        response.results.accounts.push(mappedLinkedAccount)
      })
    }

    const youTubeSectionLimit = limit - (contentStreamResults[0].length + userContentResults[0].length + linkedAccountResults[0].length + manualProfileResult[0].length)
    if (ytOnlineResults.items.length !== 0) {
      for (let i = ytOnlineResults.items.length - 1; i >= 0; i--) {
        const content = ytOnlineResults.items[i];
        switch (content.id.kind) {
          case YouTubeOnlineFilters.Channals:
            const channalExists = response.results.channels.find(channel => {

              return channel.externalId == content.id.channelId
            })

            if (channalExists) {
              //console.log("channalExists",channalExists)
              ytOnlineResults.items.splice(i, 1)
            } else {
              response.results.channels.push(mapToYoutubeOnlineModel(content));
              //console.log("channel added from online",content)
            }
            break;
          case YouTubeOnlineFilters.Videos:
            const videoExists = response.results.videos.find(video => video.externalId == content.id.videoId)
            //console.log("videoExists",videoExists)
            if (videoExists) {
              ytOnlineResults.items.splice(i, 1)
              continue;
            } else {
              response.results.videos.push(mapToYoutubeOnlineModel(content));
              //console.log("video added from online",content)
            }
            break;
          case YouTubeOnlineFilters.Playlists:
            const playlistExists = response.results.playlist.find(playlist => playlist.externalId == content.id.playlistId)
            //console.log("playlistExists",playlistExists)
            if (playlistExists) {
              ytOnlineResults.items.splice(i, 1)
              continue;
            } else {
              response.results.playlist.push(mapToYoutubeOnlineModel(content));
              //console.log("playlist added from online",content)
            }
            break;

          default:
            break;
        }
      }

      if (ytOnlineResults.items.length !== 0) {
        console.log("length ", ytOnlineResults.items.length)
        console.log("length with out youtube ", contentStreamResults[0].length + userContentResults[0].length + linkedAccountResults[0].length)
        console.log("limit ", limit)
        console.log("content stream limit", sectionLimits.contentStream)

        console.log("youTubeSectionLimit ", youTubeSectionLimit)
        for (let i = 0; i < youTubeSectionLimit; i++) {
          //console.log("YouTube Online Results items left to process",ytOnlineResults.items.length)
          //console.log("YouTube Online Results items left to process index",i)
          const content = ytOnlineResults.items[i];
          switch (content.id.kind) {
            case YouTubeOnlineFilters.Channals:
              response.results.channels.push(mapToYoutubeOnlineModel(content));
              // console.log("channel added from online",content)
              break;
            case YouTubeOnlineFilters.Videos:
              response.results.videos.push(mapToYoutubeOnlineModel(content));
              // console.log("video added from online",content)
              break;
            case YouTubeOnlineFilters.Playlists:
              response.results.playlist.push(mapToYoutubeOnlineModel(content));
              // console.log("playlist added from online",content)
              break;
            default:
              break;
          }

        }
        try {
          await this.contentStreamImportQueue.add(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT, {
            youTubeSearchOnlineResponse: ytOnlineResults.items,
          },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 }
            })
        } catch (error) {
          logger.error('Error adding job to ContentStreamImportQueue:', error);
        }
        //console.log(`YouTube Online Results: Fetched ${ytOnlineResults.items.length} items.`);

      }
    }

    return response
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

  private async searchManualProfileAsync(skipSearch: boolean, params: QueryOptions): Promise<[ManualProfile[], number]> {

    if (skipSearch) {
      return [[], 0]
    }

    return await this.manualProfileRepository.getEntriesAsync(params);
  }

  private async searchContentStreamAsync(skipSearch: boolean, params: QueryOptions): Promise<[ContentStream[], number]> {

    if (skipSearch) {
      return [[], 0]
    }

    return await this.contenStreamRepository.getEntriesAsync(params);
  }

  private async fetchYouTubeOnlineAsync(
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