import { ApiProperty } from '@nestjs/swagger';

export interface FacebookUserDataModel {
  id: string;
  name: string;
  email: string;
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

export interface FacebookOnlineModel {
  id: string;
  title: string;
  type: string;
  platform: string;
  externalId: string;
  description?: string;
  picture?: string;
  link?: string;
  message?: string;
  story?: string;
  from?: Record<string, any>;
  reactions?: Record<string, any>;
  commentCount?: number;
  sharesCount?: number;
  permalinkUrl?: string;
  createdAt?: string;
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
}

export interface FacebookSearchItemModel {
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

export interface FacebookResponseModel {
  data: FacebookSearchItemModel[];
  paging?: FacebookPaging;
}

export class FacebookSearchResponseModel {
  query: string;
  results: {
    feeds?: FacebookResponseModel;
    posts?: FacebookResponseModel;
    likes?: FacebookResponseModel;
    pages?: FacebookResponseModel;
    groups?: FacebookResponseModel;
    events?: FacebookResponseModel;
    people?: FacebookResponseModel;
    videos?: FacebookResponseModel;
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
