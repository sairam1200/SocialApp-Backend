export interface TwitterUserData {
  data: {
    id: string;
    name: string;
    username: string;
    created_at?: string;
    description?: string;
    profile_image_url?: string;
    verified?: boolean;
    protected?: boolean;
    location?: string;
    url?: string;
    entities?: any;
    pinned_tweet_id?: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
    withheld?: {
      country_codes?: string[];
      scope?: string;
    };
  };
}
