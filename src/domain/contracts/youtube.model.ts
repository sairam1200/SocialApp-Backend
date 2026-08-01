import { ApiProperty } from '@nestjs/swagger';

export type GoogleUserDataType = {
  id: string;
  name: string;
  given_name: string;
  family_name: string;
  email: string;
  picture: string;
  locale: string;
  hd?: string;
};

export type YoutubeChannelDataType = {
  kind: string;
  etag: string;
  items: YoutubeChannelModel[];
};

interface YoutubeChannelModel {
  kind: string;
  id: string; // Channel ID
  snippet: {
    title: string; // Channel title
    description: string; // Channel description
    customUrl?: string; // channel handle
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
  };
  statistics: {
    viewCount: string; // Total views
    subscriberCount: string; // Total subscribers
    hiddenSubscriberCount: boolean; // Whether subscribers are hidden
    videoCount: string; // Number of videos uploaded
  };
  contentDetails: {
    relatedPlaylists: {
      uploads: string;
      likes: string; // Playlist ID for the user's uploaded videos
    };
  };
  brandingSettings: {
    channel: {
      title: string; // Channel title
      description: string; // Channel description
    };
  };
}

export class YoutubeProfileModel {
  @ApiProperty()
  id: string;
  @ApiProperty()
  hd: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  email: string;
  @ApiProperty()
  userId: string;
  @ApiProperty()
  locale: string;
  @ApiProperty()
  userName: string;
  @ApiProperty()
  youtubeId: string;
  @ApiProperty({ default: false })
  allowImport: boolean;
  @ApiProperty()
  profileImage: string;
  @ApiProperty()
  customUrl: string;
  @ApiProperty({ default: 0 })
  followersCount: number;
  @ApiProperty({ default: 0 })
  followingCount: number;
  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      viewCount: { type: 'number', default: 0 },
      description: { type: 'string' },
      videoCount: { type: 'number', default: 0 },
      thumbthumbnail: { type: 'string' },
    },
  })
  channel: {
    id: string;
    title: string;
    viewCount: number;
    customUrl: string;
    description: string;
    videoCount: number;
    thumbthumbnail: string;
  };
}

export class YouTubeSearchParamsModel {
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
  forceRefresh?: boolean; // If true, always fetch from YouTube API regardless of cache
}

export type YouTubeSearchResponseDataType = {
  kind: string;
  etag: string;
  regionCode: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: any[];
  nextPageToken?: string;
  prevPageToken?: string;
};

export class YoutubeSearchResponseModel {
  query: string;
  results: YouTubeContentModel[];
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
  prevPageToken?: string;

  constructor() {
    this.query = '';
    this.results = [];
  }
}

export class YouTubeContentModel {
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
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  publishedAt?: string;

  @ApiProperty({ required: false })
  videoId?: string;

  @ApiProperty({ required: false })
  channelId?: string;

  @ApiProperty({ required: false })
  channelName?: string;

  @ApiProperty({ required: false })
  channelUsername?: string;

  @ApiProperty({ required: false })
  channelProfileImage?: string;

  @ApiProperty({ required: false, default: 0 })
  viewCount?: number;

  @ApiProperty({ required: false, default: 0 })
  likeCount?: number;

  @ApiProperty({ required: false, default: 0 })
  commentCount?: number;

  @ApiProperty({ required: false })
  duration?: string;
  @ApiProperty({ required: false })
  shorts?: boolean;
}
