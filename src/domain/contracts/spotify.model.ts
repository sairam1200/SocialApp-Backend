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