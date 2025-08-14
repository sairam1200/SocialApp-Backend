import axios from "axios";
import _const from "../../core/utils/const";
import logger from "../../core/utils/winston.util";
import { Inject, Injectable } from "@nestjs/common";
import { ContentStream, LinkedAccount, UserContent } from "../../domain/entities";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { ISearchService } from "../../domain/services/isearch.service";
import limitAllocatorUtil, { SectionSkipMap } from "../../core/utils/limitAllocator.util";
import {  SearchResponseModel, SearchSectionResponseModel, YouTubeSearchParamsModel, YouTubeSearchResponseModel } from "../../domain/contracts/youtube.model";
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

  public async searchYoutubeAsync(params: YouTubeSearchParamsModel): Promise<SearchResponseModel> {
    const response: SearchResponseModel = {
      query: "",
      sections: {
        channals: [],
        videos: [],
        shorts: [],
        playList: [],
        accounts: [],
        subscriptions: [],
        playlist: [],
        playlist_video: [],
        activities:[],
        pageInfo: {
          page: 0,
          pageSize: 0
        }

      }

    }
    console.debug('Search Params:', params);
    const { filters, limit, normalizedQuery, originalQuery, accessToken, pageToken, page } = params;

    response.query=originalQuery

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
      console.log('Content Stream Results:', contentStreamResults[0]);

    }

    if (userContentResults[0].length !== 0) {
      userContentResults[0].forEach((content : UserContent)=>{
        if(content.type==="channel"){
          const channal : SearchSectionResponseModel= {
            id: content.id,
            userId: content.userId,
            type: content.type,
            title: content.title,
            platform: content.platform,
            externalId:  content.externalId,
            metaData:{
              description: content.metaData.desciption,
              thumbnails: content.metaData.thumbnails ,
              statistics: content.metaData.statistics,
            }
           
          }
          response.sections.channals.push(channal)
        }else if(content.type === "uploaded_video"){
          const uploaded_video : SearchSectionResponseModel =  {
            id: content.id,
            userId: content.userId,
            title: content.title,
            type: content.type,
            platform: content.platform,
            externalId: content.externalId,
            metaData: {
              externalId: content.externalId,
              description: content.metaData.desciption,
              videoId: content.metaData.videoId,
              thumbnails: content.metaData.thumbnails
            }

          }
          response.sections.videos.push(uploaded_video)
        }else if(content.type === "activity"){
          const activity : SearchSectionResponseModel =  {
            id: content.id,
            userId: content.userId,
            title: content.title,
            type: content.type,
            externalId: content.externalId,
            platform: content.platform,
            metaData:{
              publishedAt: content.metaData.publishedAt,
              channelId: content.metaData.channelId,
              description: content.metaData.desciption,
              thumbnails: content.metaData.thumbnails
            }
          } 
          response.sections.activities.push(activity)
        }else if(content.type === "playlist_video"){
          const playlistVideo : SearchSectionResponseModel = {
            id: content.id,
            userId: content.userId,
            title: content.title,
            type: content.type,
            externalId: content.externalId,
            platform: content.platform,
            metaData: {
              videoId: content.metaData.videoId,
              publishedAt: content.metaData.publishedAt,
              description: content.metaData.description,
              thumbnails: content.metaData.thumbnails,
              playlistId: content.metaData.playlistId
            }

          }
          response.sections.playlist_video.push(playlistVideo)
        }else if(content.type === "playlist"){
          const playList: SearchSectionResponseModel ={
            id: content.id,
            userId: content.userId,
            title: content.title,
            type: content.type,
            externalId: content.externalId,
            platform: content.platform,
            metaData:{
              playlistId: content.metaData.playlistId,
              description: content.metaData.description,
              itemCount: content.metaData.itemCount,
              publishedAt: content.metaData.publishedAt,
              thumbnails: content.metaData.thumbnails
            }
          }
          response.sections.playList.push(playList)
        }else if(content.type === "subscription"){
          const subscription : SearchSectionResponseModel = {
            id: content.id,
            userId: content.userId,
            title: content.title,
            type: content.type,
            externalId: content.externalId,
            platform: content.platform,
            metaData: {
              description: content.metaData.description,
              publishedAt: content.metaData.publishedAt,
              thumbnails: content.metaData.thumbnails
            }
          }
          response.sections.subscriptions.push(subscription)
        }
      })
      console.log('User Content Results:', userContentResults[0]);

    }

    if (linkedAccountResults[0].length !== 0) {
      linkedAccountResults[0].forEach((account:LinkedAccount)=>{
        response.sections.accounts.push(account)
      })
      console.log('Linked Account Results:', linkedAccountResults[0]);

    }

    if (ytOnlineResults.items.length !== 0) {
      ytOnlineResults.items.forEach((content)=>{
        if(content.id.kind==="youtube#channel"){
          const channal : SearchSectionResponseModel= {
            id: content.id.channelId,
            type: content.id.kind,
            title: content.snippet.title,
            platform: _const.PLATFORMS.YOUTUBE,
            metaData:{
              description: content.snippet.description,
              thumbnails: content.snippet.thumbnails ,
              channelTitle: content.snippet.channelTitle,
              etag: content.etag,
              liveBroadcastContent: content.snippet.liveBroadcastContent,
              publishedAt: content.snippet.publishedAt,
            }
           
          }
          response.sections.channals.push(channal)
        }else if(content.id.kind === "youtube#video"){
          const video : SearchSectionResponseModel =  {
            id: content.id.channelId,
            type: content.id.kind,
            title: content.snippet.title,
            platform: _const.PLATFORMS.YOUTUBE,
            metaData:{
              description: content.snippet.description,
              thumbnails: content.snippet.thumbnails ,
              channelTitle: content.snippet.channelTitle,
              etag: content.etag,
              liveBroadcastContent: content.snippet.liveBroadcastContent,
              publishedAt: content.snippet.publishedAt,
            
            }

          }
          response.sections.videos.push(video)
        }else  if(content.id.kind === "youtube#playlist"){
          const playlist : SearchSectionResponseModel =  {
            id: content.id.playlistId,
            type: content.id.kind,
            platform: _const.PLATFORMS.YOUTUBE,
            metaData:{
              description: content.snippet.description,
              thumbnails: content.snippet.thumbnails ,
              channelTitle: content.snippet.channelTitle,
              etag: content.etag,
              liveBroadcastContent: content.snippet.liveBroadcastContent,
              publishedAt: content.snippet.publishedAt,
              playlistId: content.id.playlistId
            }

          }
          response.sections.playlist.push(playlist)
        }
      })
      console.log('YouTube Online Results:', ytOnlineResults.items);

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