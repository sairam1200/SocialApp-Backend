import { ApiProperty } from '@nestjs/swagger';

export type SpotifyUserDataType = {
  country?: string;
  display_name?: string;
  email?: string;
  explicit_content?: {
    filter_enabled: boolean;
    filter_locked: boolean;
  };
  external_urls: {
    spotify: string;
  };
  followers?: {
    href: string | null;
    total: number;
  };
  href: string;
  id: string;
  images: Array<{
    url: string;
    height: number | null;
    width: number | null;
  }>;
  product?: 'premium' | 'free' | 'open';
  type: 'user';
  uri: string;
}

export interface SpotifyProfileModel {
  id: string;
  email: string;
  userId: string;
  spotifyId: string;
  profileImage: string;
  allowImport: boolean;
  followingCount: number;
  explicitContentEnabled: string;
  explicitContentLocked: string;
  followersCount: number;
  accountType: string;
  spotifyUrl: string;
  userName: string;
  product: string;
  country: string;
  name: string;
  uri: string;
}

export class SpotifyPlaylistOwnerModel {
  @ApiProperty()
  name: string;

  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  href: string;

  @ApiProperty()
  externalUrl: string;
}

export class SpotifyPlaylistModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: SpotifyPlaylistOwnerModel })
  owner: SpotifyPlaylistOwnerModel;

  @ApiProperty()
  public: boolean;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty()
  trackCount: number;

  @ApiProperty()
  playListId: string;

  @ApiProperty()
  description: string;
}

export class SpotifyTrackArtistModel {
  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  href: string;
}

export class SpotifyTrackAlbumModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  href: string;

  @ApiProperty()
  imageUrl: string;
}

export class SpotifyTrackModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  releaseDate: Date;

  @ApiProperty()
  durationMs: number;

  @ApiProperty({ type: [SpotifyTrackArtistModel] })
  artists: SpotifyTrackArtistModel[];

  @ApiProperty({ type: SpotifyTrackAlbumModel })
  album: SpotifyTrackAlbumModel;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  explicit: boolean;

  @ApiProperty()
  popularity: number;

  @ApiProperty()
  previewUrl: string;
}

export class SpotifyAlbumArtistModel {
  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  href: string;
}

export class SpotifyAlbumModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  href: string;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  releaseDate: Date;

  @ApiProperty()
  url: string;

  @ApiProperty()
  totalTracks: number;

  @ApiProperty({ type: [SpotifyAlbumArtistModel] })
  artists: SpotifyAlbumArtistModel[];

  @ApiProperty()
  albumId: string;
}

export class SpotifyShowCopyrightModel {
  @ApiProperty()
  text: string;

  @ApiProperty()
  type: string;
}

export class SpotifyShowDetailsModel {
  @ApiProperty({ type: [String] })
  availableMarkets: string[];

  @ApiProperty({ type: [SpotifyShowCopyrightModel] })
  copyRights: SpotifyShowCopyrightModel[];
}

export class SpotifyShowModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  showId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  explicit: boolean;

  @ApiProperty()
  htmlDescription: string;

  @ApiProperty({ type: [String] })
  languages: string[];

  @ApiProperty()
  publisher: string;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  addedOn: string;

  @ApiProperty()
  totalEpisodes: string;

  @ApiProperty()
  mediaType: string;

  @ApiProperty({ type: SpotifyShowDetailsModel })
  show: SpotifyShowDetailsModel;
}

export class SpotifyArtistModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  externalId?: string;

  @ApiProperty({ required: false })
  href?: string;

  @ApiProperty({ required: false })
  popularity?: number;

  @ApiProperty({ required: false, type: [String] })
  genres?: string[];

  @ApiProperty({ required: false })
  imageUrl?: string;

  @ApiProperty({ required: false })
  followersCount?: number;

  [key: string]: any;
}

export class SpotifySearchParamsModel {
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
  offset?: number;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class SpotifySearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    tracks: SpotifyTrackModel[];
    albums: SpotifyAlbumModel[];
    playlists: SpotifyPlaylistModel[];
    artists: SpotifyArtistModel[];
    shows: SpotifyShowModel[];
  };

  constructor() {
    this.query = '';
    this.result = {
      tracks: [],
      albums: [],
      playlists: [],
      artists: [],
      shows: [],
    };
  }
}
