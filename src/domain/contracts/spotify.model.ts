export interface SpotifyUserDataModel {
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


export interface SpotifyPlaylistModel {
  id: string;
  name: string;
  type: 'playlist';
  owner: {
    name: string;
    id: string;
    type: string;
    href: string;
    externalUrl: string;
  };
  public: boolean;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
  playListId: string;
  description: string;
}

export interface SpotifyTrackModel {
  id: string;
  type: 'track';
  name: string;
  url: string;
  releaseDate: Date;
  durationMs: number;
  artists: Array<{
    name: string;
    type: string;
    href: string;
  }>;
  album: {
    id: string;
    name: string;
    href: string;
    imageUrl: string;
  };
  duration: number;
  explicit: boolean;
  popularity: number;
  previewUrl: string;
}

export interface SpotifyAlbumModel {
  id: string;
  type: 'album';
  name: string;
  href: string;
  imageUrl: string;
  releaseDate: Date;
  url: string;
  totalTracks: number;
  artists: Array<{
    name: string;
    type: string;
    href: string;
  }>;
  albumId: string;
}