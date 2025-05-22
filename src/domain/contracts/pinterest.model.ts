import { ApiProperty } from '@nestjs/swagger';

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

export class PinterestProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  pinterestId: string;

  @ApiProperty()
  profileImage: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  monthlyViews: number;

  @ApiProperty()
  allowImport: boolean;

  @ApiProperty()
  websiteUrl: string;

  @ApiProperty()
  pinCount: number;

  @ApiProperty()
  about: string;
}