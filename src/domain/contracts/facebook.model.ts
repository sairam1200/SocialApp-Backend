import { ApiProperty } from '@nestjs/swagger';

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

export class FacebookProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  facebookId: string;

  @ApiProperty()
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;
}
