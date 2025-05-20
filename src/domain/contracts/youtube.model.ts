export interface GoogleUserDataModel {
  sub: string;
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

export interface YoutubeProfileModel {
  id: string;
  hd: string;
  name: string;
  email: string;
  userId: string;
  locale: string;
  userName: string;
  facebookId: string;
  allowImport: boolean;
  profileImage: string;
  followersCount: number;
  followingCount: number;
  channel: {
    id: string;
    title: string;
    viewCount: number;
    desciption: string;
    videoCount: number;
    thumbthumbnail: string;
  }
}