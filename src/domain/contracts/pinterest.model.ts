import { ApiProperty } from '@nestjs/swagger';

export type PinterestUserDataType = {
  id: string;
  username: string;
  profile_image: string;
  website_url: string;
  about: string;
  board_count: number;
  pin_count: number;
  follower_count: number;
  following_count: number;
  monthly_views: number;
};

export class PinterestProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  pinterestId: string;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;

  @ApiProperty({ default: 0 })
  monthlyViews: number;

  @ApiProperty({ default: false })
  allowImport: boolean;

  @ApiProperty()
  websiteUrl: string;

  @ApiProperty({ default: 0 })
  pinCount: number;

  @ApiProperty()
  about: string;
}

export class PinterestContentModel {
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
  imageUrl?: string;

  @ApiProperty({ required: false })
  boardId?: string;

  @ApiProperty({ required: false })
  boardName?: string;

  @ApiProperty({ required: false })
  link?: string;

  @ApiProperty({ required: false })
  createdAt?: string;

  @ApiProperty({ required: false, default: 0 })
  pinCount?: number;
}

export class PinterestSearchParamsModel {
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
  bookmark?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class PinterestSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    user: PinterestProfileModel[];
    content: PinterestContentModel[];
  };

  @ApiProperty({ required: false })
  bookmark?: string;

  constructor() {
    this.query = '';
    this.result = {
      user: [],
      content: [],
    };
  }
}
