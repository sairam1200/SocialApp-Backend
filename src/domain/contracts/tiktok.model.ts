import { ApiProperty } from '@nestjs/swagger';

export class TikTokProfileModel {
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

  @ApiProperty()
  platform: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metaData?: Record<string, any>;
}

export class TikTokUserDataModel {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
  union_id?: string;
  open_id?: string;
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

  @ApiProperty({ type: 'object', additionalProperties: true })
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };

  @ApiProperty()
  duration: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  dimensions: {
    height: number;
    width: number;
  };
}
