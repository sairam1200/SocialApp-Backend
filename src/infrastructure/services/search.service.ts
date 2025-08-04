import { Inject, Injectable } from "@nestjs/common";
import _const from "../../core/utils/const";
import { ISearchService } from "domain/services/isearch.service";
import { IContentStreamRepository } from "domain/repositories/icontentStream.repository";
import  axios  from "axios";
import { YouTubeSearchResponseModel } from "domain/contracts/youtube.model";

@Injectable()
export class SearchService implements ISearchService {

  constructor(
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contenStreamRepository: IContentStreamRepository,
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

  public async searchYoutubeAsync(searchTerm: string, filter?: Record<string,any>, accessToken?: string): Promise<YouTubeSearchResponseModel> {
    const baseUrl = "https://www.googleapis.com/youtube/v3/search";
    console.log("searchTerm", searchTerm);
    console.log(accessToken)
    try{
      const response = await axios.get(baseUrl, {
        params:{
          part: 'snippet',
          q: searchTerm,
          type: 'video',
          maxResults: 50,
          ...filter
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      return response.data

    }catch (error) {
      console.error("Error fetching YouTube search results:", error);
    }
  }
}