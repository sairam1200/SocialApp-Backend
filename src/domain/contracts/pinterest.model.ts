export interface PinterestUserDataModel {
  id: string;
  username: string;
  profile_image: string;
  website_url: string;
  about: string;
  board_count: number;
  pin_count: number;
  follower_count: number;
  following_count: number;
  monthly_views: number;
}

export interface PinterestProfileModel {
  id: string;
  email: string;
  userId: string;
  userName: string;
  pinterestId: string;
  profileImage: string;
  followersCount: number;
  followingCount: number;
  monthlyViews: number;
  allowImport: boolean;
  websiteUrl: string;
  pinCount: number;
  about: string;
}