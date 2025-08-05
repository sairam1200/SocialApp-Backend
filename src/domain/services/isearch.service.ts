import { YouTubeSearchResponseModel } from "domain/contracts/youtube.model";

export interface ISearchService {
  searchFacebookAsync(access_token: string): Promise<any>;
  searchInstagramAsync(access_token: string): Promise<any>;
  searchPinterestAsync(access_token: string): Promise<any>;

  searchTwitterAsync(access_token: string): Promise<any>;
  searchSpotifyAsync(access_token: string): Promise<any>;
  searchYoutubeAsync(searchTerm: string,
    limit: number,
    filters: Record<string, string | number>,
    accessToken?: string): Promise<any>;
}