import { ApiProperty } from '@nestjs/swagger';

export type FacebookUserDataType = {
  id: string;
  name: string;
  email?: string;
  username?: string;
  picture?: {
    data: {
      url: string;
    };
  };
  followers_count?: number;
  friends?: {
    summary: {
      total_count: number;
    };
  };
  birthday?: string;
  gender?: string;
  hometown?: {
    name: string;
  };
  location?: {
    name: string;
  };
  link?: string;
}

export class FacebookOnlineModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  externalId: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  picture?: string;

  @ApiProperty({ required: false })
  link?: string;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ required: false })
  story?: string;
  @ApiProperty({ required: false, default: 0 })
  reach?: number;

  @ApiProperty({ required: false, default: 0 })
  totalReactions?: number;

  @ApiProperty({ required: false, type: Object })
  reactionsByType?: Record<string, number>;
  
  @ApiProperty({ required: false, type: Object })
  from?: Record<string, any>;

  @ApiProperty({ required: false, type: Object })
  reactions?: Record<string, any>;

  @ApiProperty({ required: false, default: 0 })
  commentCount?: number;

  @ApiProperty({ required: false, default: 0 })
  sharesCount?: number;

  @ApiProperty({ required: false })
  permalinkUrl?: string;

  @ApiProperty({ required: false })
  createdAt?: string;

  @ApiProperty({ required: false })
  updatedAt?: string;
}

export class FacebookProfileModel {
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
  facebookId: string;

  @ApiProperty({ default: false })
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;
}

export class FacebookSearchParamsModel {
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

  @ApiProperty()
  pageToken?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export type FacebookSearchItemModel = {
  id: string;
  name?: string;
  message?: string;
  description?: string;
  story?: string;
  type?: string;
  about?: string;
  category?: string;
  full_picture?: string;
  link?: string;
  from?: Record<string, any>;
  reactions?: Record<string, any>;
  comments?: { length?: number };
  shares?: { count?: number };
  permalink_url?: string;
  created_time?: string;
  updated_time?: string;
  is_popular?: boolean;
  is_hidden?: boolean;
  via?: Record<string, any>;
}

export interface FacebookPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  previous?: string;
  next?: string;
}

export interface FacebookAPIResponseModel {
  data: FacebookSearchItemModel[];
  paging?: FacebookPaging;
}

export class FacebookSearchResponseModel {
  query: string;
  results: {
    feeds?: FacebookAPIResponseModel;
    posts?: FacebookAPIResponseModel;
    likes?: FacebookAPIResponseModel;
    pages?: FacebookAPIResponseModel;
    groups?: FacebookAPIResponseModel;
    events?: FacebookAPIResponseModel;
    people?: FacebookAPIResponseModel;
    videos?: FacebookAPIResponseModel;
    accounts?: any; // TODO: confirm proper type
  };

  constructor() {
    this.query = '';
    this.results = {
      feeds: { data: [], paging: undefined },
      posts: { data: [], paging: undefined },
      likes: { data: [], paging: undefined },
      pages: { data: [], paging: undefined },
      groups: { data: [], paging: undefined },
      events: { data: [], paging: undefined },
      people: { data: [], paging: undefined },
      videos: { data: [], paging: undefined },
      accounts: []
    };
  }
}
