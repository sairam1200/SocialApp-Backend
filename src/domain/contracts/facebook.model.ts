
export interface FacebookUserData {
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