import { ApiProperty } from '@nestjs/swagger';

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

export class InstagramProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  biography: string;

  @ApiProperty()
  mediaCount: number;

  @ApiProperty()
  websiteUrl: string;

  @ApiProperty()
  accountType: string;

  @ApiProperty()
  instagramId: string;

  @ApiProperty()
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;
}