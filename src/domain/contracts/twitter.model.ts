import { ApiProperty } from '@nestjs/swagger';

export type TwitterUserDataType = {
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
};

export class TwitterProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  twitterId: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ type: [String] })
  countryCodes: string[];

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  pinnedTweetId: string;

  @ApiProperty()
  listedCount: number;

  @ApiProperty()
  tweetCount: string;

  @ApiProperty()
  protected: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  location: string;

  @ApiProperty({ type: Object })
  entities: any;

  @ApiProperty()
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

  @ApiProperty()
  result: {
    user: TwitterProfileModel[];
    content: (UserTweetModel | UserLikedTweetModel)[];
  };

  @ApiProperty({ required: false })
  nextToken?: string;

  @ApiProperty()
  resultCount: number;

  constructor() {
    this.query = '';
    this.result = {
      user: [],
      content: [],
    };
    this.resultCount = 0;
  }
}
