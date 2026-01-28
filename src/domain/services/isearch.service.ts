import { PlatformSearchParamsModel } from '../contracts/platform-search.model';
import { FacebookSearchResponseModel } from '../contracts/facebook.model';
import { RedditSearchResponseModel } from '../contracts/reddit.model';
import { SpotifySearchResponseModel } from '../contracts/spotify.model';
import { PinterestSearchResponseModel } from '../contracts/pinterest.model';
import { TiktokSearchResponseModel } from '../contracts/tiktok.model';
import { InstagramSearchResponseModel } from '../contracts/instagram.model';
import { TwitterSearchResponseModel } from '../contracts/twitter.model';
import { LinkedInSearchResponseModel } from '../contracts/linkedin.model';
import { YoutubeSearchResponseModel } from '../contracts/youtube.model';
import { BehanceSearchResponseModel } from 'domain/contracts/behance.model';
import { SnapchatSearchResponseModel } from 'domain/contracts/snapchat.model';
import { ThreadsSearchResponseModel } from 'domain/contracts/threads.model';

export interface ISearchService {
  searchFacebookAsync(params: PlatformSearchParamsModel): Promise<FacebookSearchResponseModel>;
  searchInstagramAsync(params: PlatformSearchParamsModel): Promise<InstagramSearchResponseModel>;
  searchPinterestAsync(params: PlatformSearchParamsModel): Promise<PinterestSearchResponseModel>;
  searchBehanceAsync(params: PlatformSearchParamsModel): Promise<BehanceSearchResponseModel>;
  searchSnapchatAsync(params: PlatformSearchParamsModel): Promise<SnapchatSearchResponseModel>;
  searchThreadsAsync(params: PlatformSearchParamsModel): Promise<ThreadsSearchResponseModel>;
  searchTwitterAsync(params: PlatformSearchParamsModel): Promise<TwitterSearchResponseModel>;
  searchSpotifyAsync(params: PlatformSearchParamsModel): Promise<SpotifySearchResponseModel>;
  searchYoutubeAsync(params: PlatformSearchParamsModel): Promise<YoutubeSearchResponseModel>;
  searchRedditAsync(params: PlatformSearchParamsModel): Promise<RedditSearchResponseModel>;
  searchTiktokAsync(params: PlatformSearchParamsModel): Promise<TiktokSearchResponseModel>;
  searchLinkedInAsync(params: PlatformSearchParamsModel): Promise<LinkedInSearchResponseModel>;
}