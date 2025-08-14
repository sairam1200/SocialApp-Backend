
import { ApiProperty } from "@nestjs/swagger";
import { LinkedAccount } from "domain/entities";

export class GoogleUserDataModel {
  id: string;
  name: string;
  given_name: string;
  family_name: string;
  email: string;
  picture: string;
  locale: string;
  hd?: string;
}

export interface YoutubeChannelDataModel {
  kind: string;
  etag: string;
  items: YoutubeChannelModel[];
}
export interface YouTubeSearchResponseModel {
  kind: string;
  etag: string;
  nextPageToken?: string;
  regionCode: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YoutubeSearchItemModel[];
}
export interface YoutubeSearchItemModel {
  kind: string;
  etag: string;
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string
  };
  snippet: {
    publishedAt: Date;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
      standard: { url: string };
      maxres: { url: string };
    };
    channelTitle: string;
    liveBroadcastContent?: string;
  };
}
interface YoutubeChannelModel {
  kind: string;
  id: string; // Channel ID
  snippet: {
    title: string; // Channel title
    description: string; // Channel description
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
      uploads: string; // Playlist ID for the user's uploaded videos
    };
  };
  brandingSettings: {
    channel: {
      title: string; // Channel title
      description: string; // Channel description
    };
  };
}
export interface SearchResponseModel{
  query: string;
  sections:{
    channals: SearchSectionResponseModel[];
    videos: SearchSectionResponseModel[];
    shorts: SearchSectionResponseModel[];
    playList: SearchSectionResponseModel[];
    accounts: LinkedAccount[];
    subscriptions: SearchSectionResponseModel[],
    playlist: SearchSectionResponseModel[],
    playlist_video: SearchSectionResponseModel[]
    activities: SearchSectionResponseModel[]
    pageInfo?: {
      page: number;
      pageSize: number;
    }

  }
}

export interface SearchSectionResponseModel{
  id: string
  userId?: string;
  type: string;
  title?: string;
  platform: string;
  externalId?: string;
  metaData?: Record<string, any>;

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
      desciption: { type: 'string' },
      videoCount: { type: 'number', default: 0 },
      thumbthumbnail: { type: 'string' },
    },
  })
  channel: {
    id: string;
    title: string;
    viewCount: number;
    desciption: string;
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
}