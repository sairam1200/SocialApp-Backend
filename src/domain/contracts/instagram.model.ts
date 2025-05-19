export interface InstagramUserDataModel {
  id: string;
  username: string;
  name?: string;
  type?: string;
  profile_picture_url?: string;
  biography?: string;
  website?: string;
  media_count?: number;
  followers_count?: number;
  follows_count?: number;
}

export interface InstagramProfileModel {
  id: string;
  email: string;
  userName: string;
  biography: string;
  mediaCount: number;
  websiteUrl: string;
  accountType: string;
  instagramId: string;
  profileImage: string;
  followerCount: number;
  followingCount: number;
}