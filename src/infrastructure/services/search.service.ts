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
  IContentStreamRepository,
  ILinkedAccountRepository,
  IUserContentRepository,
} from '../../domain/repositories';
import { mapToLinkedInProfileModel } from 'domain/mappers/linkedin.mapper';
import {
  mapContentStreamToYouTubeOnlineModel,
  mapToYoutubeActivityModel,
  mapToYoutubeChannelInfoModel,
  mapToYoutubeOnlineModel,
  mapToYoutubePlaylisVideoModel,
  mapToYoutubePlaylistModel,
  mapToYoutubeSubscriptionsModel,
  mapToYoutubeUploadedVideosModel,
  mapYouTubeOnlineResponseToContentStream,
} from 'domain/mappers/youtube.mapper';
import { YouTubeUserContentFilters, YouTubeOnlineFilters } from 'domain/enums';
import { LinkedInProfileModel } from 'domain/contracts/linkedin.model';
import { IGeneralRepository } from 'domain/repositories/igeneral.repository';
import {
  FacebookSearchParamsModel,
  FacebookSearchResponseModel,
} from 'domain/contracts/facebook.model';
import { mapFacebookOnlineResponseToContentStream } from 'domain/mappers/facebook.mapper';

@Injectable()
export class SearchService implements ISearchService {
  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @InjectQueue(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT)
    private readonly contentStreamImportQueue: Queue,
    @Inject(_const.IGENERAL_REPOSITORY)
    private readonly generalRepository: IGeneralRepository,
  ) {}

  public async searchFacebookAsync(
    params: FacebookSearchParamsModel,
  ): Promise<FacebookSearchResponseModel> {
    const response = new FacebookSearchResponseModel();
    response.query = params.originalQuery;

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

    const skipContentStreamSerch =
      filters.type &&
      !['Profile', 'Content', 'Community'].includes(filters.type);
    const skipUserContentSearch =
      filters.type && !['video', 'playlist'].includes(filters.type);
    const skipLinkedAccountSearch =
      filters.type && !['channel'].includes(filters.type);
    const skipOnlineSearch = page > 1 && !pageToken;

    // Determine which sections to skip (for simplicity, we’ll check all)
    const skips: SectionSkipMap = {
      contentStream: false,
      userContent: false,
      linkedAccount: false,
      manualProfile: false,
    };

    // Step 1: Fetch data from Facebook Graph API
    const fbOnlineResults = await this.fetchFacebookOnlineAsync(
      skipOnlineSearch,
      normalizedQuery,
      limit,
      filters,
      accessToken,
    );

    // Step 2: Map Facebook results into ContentStream entities
    const mappedFbOnlineResults = await Promise.all(
      fbOnlineResults.items.map((item) =>
        mapFacebookOnlineResponseToContentStream(item),
      ),
    );

    // Step 3: Check which ones are new
    const fbOnlineExternalIds = mappedFbOnlineResults.map(
      (content) => content.externalId,
    );
    console.log('this is the list of ids to check', fbOnlineExternalIds);

    const listIds = await this.generalRepository.checkExistingItemsAsync(
      fbOnlineExternalIds,
      _const.PLATFORMS.FACEBOOK,
    );
    console.log("this is the list of ids that doesn't exist", listIds);

    const newContents = mappedFbOnlineResults.filter((content) =>
      listIds.includes(content.externalId),
    );

    console.log('this is the list of contents to add', newContents);

    // Step 4: Insert new contents if any
    if (newContents.length > 0) {
      const result = await this.generalRepository.createAsync(newContents);
      console.log('this are the external id  of the bulk insert', result);
    }

    // Step 5: Assign results to response
    response.results.posts.data = fbOnlineResults.data;
    response.results.posts.paging = fbOnlineResults.paging;

    return response;
  }

  private async fetchFacebookOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number> = {},
    accessToken: string,
    pageToken?: string,
  ): Promise<any> {
    const emptyResult = { data: [] };

    try {
      const baseUrl = `https://graph.facebook.com/v23.0/search`;

      const params: Record<string, string | number> = {
        q: query,
        type: filters.type || 'post', // can be page, post, group, event, place
        limit: limit,
        fields: 'id,name,about,picture{url},category,message', //TODO: Confirm that these fields are correct
        access_token: accessToken,
      };

      const response = await axios.get(baseUrl, { params });
      console.log('Search response', response);
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
    const response = new SearchResponseModel();
    const {
      filters,
      limit,
      normalizedQuery,
      originalQuery,
      accessToken,
      pageToken,
      page,
    } = params;

    response.query = originalQuery;

    if (!filters?.platform || filters.platform !== _const.PLATFORMS.YOUTUBE) {
      filters.platform = _const.PLATFORMS.YOUTUBE;
    }
    const skipContentStreamSerch =
      filters.type &&
      !['Profile', 'Content', 'Community'].includes(filters.type);
    const skipUserContentSearch =
      filters.type && !['video', 'playlist'].includes(filters.type);
    const skipLinkedAccountSearch =
      filters.type && !['channel'].includes(filters.type);
    const skipOnlineSearch = page > 1 && !pageToken;

    const skips: SectionSkipMap = {
      contentStream: skipContentStreamSerch,
      userContent: skipUserContentSearch,
      linkedAccount: skipLinkedAccountSearch,
      manualProfile: false,
    };
    // loop and check in every table if the content exist if not add to the response
    const ytOnlineResults = await this.fetchYouTubeOnlineAsync(
      skipOnlineSearch,
      originalQuery,
      limit,
      filters,
      accessToken,
    );
    // am mapping it becuase of how the ids are structured
    const mappedYtOnlineResults = await Promise.all(
      ytOnlineResults.items.map((item) =>
        mapYouTubeOnlineResponseToContentStream(item),
      ),
    );

    if (ytOnlineResults) {
      const contentsToAdd: ContentStream[] = [];
      const ytOnlineExternalIds = mappedYtOnlineResults.map(
        (content) => content.externalId,
      );
      console.log('this is the list of ids to check', ytOnlineExternalIds);
      const listIds = await this.generalRepository.checkExistingItemsAsync(
        ytOnlineExternalIds,
        _const.PLATFORMS.YOUTUBE,
      );
      console.log("this is the list of ids that doesn't exist", listIds);
      listIds.forEach((id) => {
        mappedYtOnlineResults.forEach((content) =>
          id == content.externalId ? contentsToAdd.push(content) : null,
        );
      });
      console.log('this is the list of contents to add', contentsToAdd);
      // pass the content to add to the general repository and make sure to use sql script
      if (contentsToAdd.length > 0) {
        const result = await this.generalRepository.createAsync(contentsToAdd);
        console.log('this are the external id  of the bulk insert', result);
      }
    }
    const sectionLimits = limitAllocatorUtil.getSectionLimits(limit, skips);
    console.log('this is the section limits', sectionLimits);
    const [contentStreamResults, userContentResults, linkedAccountResults] =
      await Promise.all([
        this.searchContentStreamAsync(skipContentStreamSerch, {
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

    if (contentStreamResults[0].length !== 0) {
      console.log(
        'this is the content stream results and limit',
        contentStreamResults[0],
        sectionLimits.contentStream,
      );
      contentStreamResults[0].forEach((content: ContentStream) => {
        const mappedContent = mapContentStreamToYouTubeOnlineModel(content);
        switch (mappedContent.type) {
          case YouTubeOnlineFilters.Channals:
            response.results.channels.push(mappedContent);
            break;
          case YouTubeOnlineFilters.Videos:
            response.results.videos.push(mappedContent);
            break;
          case YouTubeOnlineFilters.Playlists:
            response.results.playlist.push(mappedContent);
            break;
          default:
            break;
        }
      });
    }

    if (userContentResults[0].length > 0) {
      console.log(
        'this is the user content results and limit',
        userContentResults[0],
        sectionLimits.userContent,
      );
      userContentResults[0].forEach((content: UserContent) => {
        switch (content.type) {
          case YouTubeUserContentFilters.Channals:
            response.results.channels.push(
              mapToYoutubeChannelInfoModel(content),
            );
            break;
          case YouTubeUserContentFilters.Videos:
            response.results.videos.push(
              mapToYoutubeUploadedVideosModel(content),
            );
            break;
          case YouTubeUserContentFilters.Playlists:
            response.results.playlist.push(mapToYoutubePlaylistModel(content));
            break;
          case YouTubeUserContentFilters.Activities:
            response.results.activities.push(
              mapToYoutubeActivityModel(content),
            );
            break;
          case YouTubeUserContentFilters.PlaylistVideos:
            response.results.playlistVideo.push(
              mapToYoutubePlaylisVideoModel(content),
            );
            break;
          case YouTubeUserContentFilters.Subscriptions:
            const results = mapToYoutubeSubscriptionsModel(content);

            response.results.subscriptions.push(results);
            break;
          default:
            break;
        }
      });
    }

    if (linkedAccountResults[0].length !== 0) {
      console.log(
        'this is the linked account results and limit',
        linkedAccountResults[0],
        sectionLimits.linkedAccount,
      );
      linkedAccountResults[0].forEach((account: LinkedAccount) => {
        const mappedLinkedAccount = mapToLinkedInProfileModel(account);
        response.results.accounts.push(mappedLinkedAccount);
      });
    }

    /*
    if (ytOnlineResults.items.length !== 0) {
      var countAdded = 0
      const youTubeSectionLimit = limit - (contentStreamResults[0].length + userContentResults[0].length + linkedAccountResults[0].length)
    
      for (let i = ytOnlineResults.items.length-1; i >= 0; i--){ 
       
        let exists = false;
        const content = ytOnlineResults.items[i];
        switch (content.id.kind) {
          case YouTubeOnlineFilters.Channals:
            const channalExists = response.results.channels.find(channel=>{
              return channel.externalId == content.id.channelId
            })
            exists = !!channalExists
           
            if(!channalExists){
              if(countAdded <= youTubeSectionLimit){
                response.results.channels.push(mapToYoutubeOnlineModel(content));
                countAdded++;
              }
              
            }
            break;
          case YouTubeOnlineFilters.Videos:
            const videoExists = response.results.videos.find(video=>video.externalId == content.id.videoId)
            exists = !!videoExists
            if(!videoExists){
              if(countAdded <= youTubeSectionLimit){
                response.results.channels.push(mapToYoutubeOnlineModel(content));
                countAdded++;
              }
             
            }
            break;
          case YouTubeOnlineFilters.Playlists:
            const playlistExists = response.results.playlist.find(playlist=>playlist.externalId == content.id.playlistId)
            exists = !!playlistExists
            if(!playlistExists){
              if(countAdded <= youTubeSectionLimit){
                response.results.channels.push(mapToYoutubeOnlineModel(content));
                countAdded++;
              }
            }
            break;
          default:
            break;
        }
        if (exists) {
          ytOnlineResults.items.splice(i, 1); // remove duplicates
        }
      }
      this.contentStreamImportQueue.add(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT, {
        youTubeSearchOnlineResponse: ytOnlineResults.items,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      })
     
  
    }
    */
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

  private async fetchYouTubeOnlineAsync(
    skipSearch: boolean,
    query: string,
    limit: number,
    filters: Record<string, string | number> = {},
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
      logger.error(
        'Error fetching YouTube videos:',
        error?.response?.data || error.message || error,
      );

      return emptyResult;
    }
  }
}
