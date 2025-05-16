export interface SpotifyUserData {
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
