export interface TwitterUserDataModel {
  data: {
    id: string;
    name: string;
    username: string;
    created_at?: string;
    description?: string;
    profile_image_url?: string;
    verified?: boolean;
    protected?: boolean;
    location?: string;
    url?: string;
    entities?: any;
    pinned_tweet_id?: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
    withheld?: {
      country_codes?: string[];
      scope?: string;
    };
  };
}

export interface TwitterProfileModel {
  id: string;
  name: string;
  email: string;
  userId: string;
  userName: string;
  twitterId: string;
  description: string;
  allowImport: boolean;
  profileImage: string;
  
  countryCodes: string[];
  followersCount: number;
  followingCount: number;
  pinnedTweetId: string;
  listedCount: number;
  tweetCount: string;
  protected: boolean;
  createdAt: string;
  verified: boolean;
  location: string;
  entities: any;
  url: string;
}
import { ApiProperty } from '@nestjs/swagger';

export interface TwitterUserDataModel {
  data: {
    id: string;
    name: string;
    username: string;
    created_at?: string;
    description?: string;
    profile_image_url?: string;
    verified?: boolean;
    protected?: boolean;
    location?: string;
    url?: string;
    entities?: any;
    pinned_tweet_id?: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
    withheld?: {
      country_codes?: string[];
      scope?: string;
    };
  };
}

export interface TwitterProfileModel {
  id: string;
  name: string;
  email: string;
  userId: string;
  userName: string;
  twitterId: string;
  description: string;
  allowImport: boolean;
  profileImage: string;
  
  countryCodes: string[];
  followersCount: number;
  followingCount: number;
  pinnedTweetId: string;
  listedCount: number;
  tweetCount: string;
  protected: boolean;
  createdAt: string;
  verified: boolean;
  location: string;
  entities: any;
  url: string;
}

export class UserTweetModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  tweet: string;

  @ApiProperty()
  tweetId: string;

  @ApiProperty({ type: [String] })
  editHistoryTweetIds: string[];
}

export class UserLikedTweetModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  tweetId: string;

  @ApiProperty()
  likedTweet: string;

  @ApiProperty({ type: [String] })
  editHistoryTweetIds: string[];
}

export class TwitterSearchParamsModel {
  @ApiProperty()
  page: number;

  @ApiProperty()
  originalQuery: string;

  @ApiProperty()
  normalizedQuery: string;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  accessToken?: string;

  @ApiProperty()
  filters?: Record<string, any>;

  @ApiProperty({ required: false })
  nextToken?: string;

  @ApiProperty({ required: false })
  maxResults?: number;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class TwitterSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: [Object] })
  results: {
    tweets: any[];
    users: any[];
  };

  @ApiProperty({ required: false })
  nextToken?: string;

  @ApiProperty()
  resultCount: number;

  constructor() {
    this.query = '';
    this.results = {
      tweets: [],
      users: [],
    };
    this.resultCount = 0;
  }
}