import { ApiProperty } from '@nestjs/swagger';

export interface InstagramUserDataModel {
  id: string;
  username: string;
  name?: string;
  type?: string;
  profile_picture_url?: string;
  biography?: string;
  website?: string;
  media_count?: number;
  followers_count?: number;
  follows_count?: number;
}

export class InstagramProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  biography: string;

  @ApiProperty({ default: 0 })
  mediaCount: number;

  @ApiProperty()
  websiteUrl: string;

  @ApiProperty()
  accountType: string;

  @ApiProperty()
  instagramId: string;

  @ApiProperty({ default: false })
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;
}

export class InstagramContentModel {
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
  caption?: string;

  @ApiProperty({ required: false })
  mediaType?: string;

  @ApiProperty({ required: false })
  mediaUrl?: string;

  @ApiProperty({ required: false })
  permalink?: string;

  @ApiProperty({ required: false })
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  timestamp?: string;

  @ApiProperty({ required: false })
  username?: string;

  @ApiProperty({ required: false, default: 0 })
  likeCount?: number;

  @ApiProperty({ required: false, default: 0 })
  commentsCount?: number;
}

export class InstagramSearchParamsModel {
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

export class InstagramSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: [Object] })
  results: {
    media: any[];
    users: any[];
    hashtags: any[];
  };

  @ApiProperty({ required: false })
  after?: string;

  constructor() {
    this.query = '';
    this.results = {
      media: [],
      users: [],
      hashtags: [],
    };
  }
}