import { FacebookSearchParamsModel } from '../contracts/facebook.model';
import { YouTubeSearchParamsModel } from '../contracts/youtube.model';

export interface ISearchService {
  searchFacebookAsync(params: FacebookSearchParamsModel): Promise<any>;
  searchInstagramAsync(access_token: string): Promise<any>;
  searchPinterestAsync(access_token: string): Promise<any>;

  searchTwitterAsync(access_token: string): Promise<any>;
  searchSpotifyAsync(access_token: string): Promise<any>;
  searchYoutubeAsync(params: YouTubeSearchParamsModel): Promise<any>;
}
