import { ApiProperty } from '@nestjs/swagger';

export interface RedditUserDataModel {
  id: string;
  name: string;
  icon_img?: string;
  subreddit?: {
    title?: string;
    display_name?: string;
    public_description?: string;
    subscribers?: number;
  };
  created_utc: number;
  is_employee: boolean;
  is_gold: boolean;
  is_mod: boolean;
  has_verified_email: boolean;
  verified: boolean;
  link_karma: number;
  comment_karma: number;
  total_karma?: number;
  over_18: boolean;
  url: string;
}

export interface RedditProfileModel {
  id: string;
  userId: string;
  redditId: string;
  userName: string;
  profileImage: string;
  allowImport: boolean;
  karma: {
    link: number;
    comment: number;
    total: number;
  };
  isVerified: boolean;
  isGold: boolean;
  isMod: boolean;
  hasVerifiedEmail: boolean;
  over18: boolean;
  redditUrl: string;
  description: string;
  displayName: string;
  createdAt: string;
}

export class RedditContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  externalId: string;

  @ApiProperty({ required: false })
  subreddit?: string;

  @ApiProperty({ required: false })
  author?: string;

  @ApiProperty({ required: false, default: 0 })
  score?: number;

  @ApiProperty({ required: false })
  upvoteRatio?: number;

  @ApiProperty({ required: false, default: 0 })
  numComments?: number;

  @ApiProperty({ required: false })
  url?: string;

  @ApiProperty({ required: false })
  permalink?: string;

  @ApiProperty({ required: false })
  createdUtc?: number;

  @ApiProperty({ required: false })
  selftext?: string;

  @ApiProperty({ required: false })
  thumbnail?: string;
}

export class RedditSearchParamsModel {
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
  after?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class RedditSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: [Object] })
  results: {
    posts: any[];
    subreddits: any[];
    users: any[];
  };

  @ApiProperty({ required: false })
  after?: string;

  @ApiProperty({ required: false })
  before?: string;

  constructor() {
    this.query = '';
    this.results = {
      posts: [],
      subreddits: [],
      users: [],
    };
  }
}
