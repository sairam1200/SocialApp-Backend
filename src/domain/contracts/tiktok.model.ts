import { ApiProperty } from '@nestjs/swagger';

export class TiktokProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  avatarUrl: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  videoCount: number;

  @ApiProperty()
  verified: boolean;
}

export type TiktokUserDataModel = {
  open_id: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}


export class TikTokVideoModel {
  id: string;
  create_time: number;
  cover_image_url: string;
  share_url: string;
  video_description: string;
  duration: number;
  height: number;
  width: number;
  title: string;
  embed_html: string;
  embed_link: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
}

export class TikTokContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  mediaUrl: string;

  @ApiProperty()
  thumbnailUrl: string;

  @ApiProperty()
  caption: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: Object, additionalProperties: true })
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };

  @ApiProperty()
  duration: number;

  @ApiProperty({ type: Object, additionalProperties: true })
  dimensions: {
    height: number;
    width: number;
  };
}

export class TiktokSearchParamsModel {
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
  cursor?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class TiktokSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: [Object] })
  results: {
    videos: any[];
    users: any[];
  };

  @ApiProperty({ required: false })
  cursor?: string;

  @ApiProperty()
  hasMore: boolean;

  constructor() {
    this.query = '';
    this.results = {
      videos: [],
      users: [],
    };
    this.hasMore = false;
  }
}
