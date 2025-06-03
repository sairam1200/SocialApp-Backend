export interface RedditUserDataModel {
  id: string;
  name: string;
  icon_img?: string;
  subreddit?: {
    title?: string;
    display_name?: string;
    public_description?: string;
    subscribers?: number;
  };
  created_utc: number;
  is_employee: boolean;
  is_gold: boolean;
  is_mod: boolean;
  has_verified_email: boolean;
  verified: boolean;
  link_karma: number;
  comment_karma: number;
  total_karma?: number;
  over_18: boolean;
  url: string;
}

export interface RedditProfileModel {
  id: string;
  userId: string;
  redditId: string;
  userName: string;
  profileImage: string;
  allowImport: boolean;
  karma: {
    link: number;
    comment: number;
    total: number;
  };
  isVerified: boolean;
  isGold: boolean;
  isMod: boolean;
  hasVerifiedEmail: boolean;
  over18: boolean;
  redditUrl: string;
  description: string;
  displayName: string;
  createdAt: string;
}
