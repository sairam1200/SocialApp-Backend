export interface ISearchService {
  searchFacebookAsync(access_token: string): Promise<any>;
  searchInstagramAsync(access_token: string): Promise<any>;
  searchPinterestAsync(access_token: string): Promise<any>;

  searchTwitterAsync(access_token: string): Promise<any>;
  searchSpotifyAsync(access_token: string): Promise<any>;
  searchYoutubeAsync(access_token: string): Promise<any>;
}