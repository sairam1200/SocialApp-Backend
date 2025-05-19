
export interface FacebookUserDataModel {
  id: string;
  name: string;
  email: string;
  username?: string;
  picture: {
    data: {
      url: string;
    };
  };
  followers_count: number;
  friends: {
    summary: {
      total_count: number;
    };
  };
}

export interface FacebookProfileModel {
  id: string;
  name: string;
  email: string;
  userId: string;
  userName: string;
  facebookId: string;
  allowImport: boolean;
  profileImage: string;
  followersCount: number;
  followingCount: number;
}