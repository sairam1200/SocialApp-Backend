import { ApiProperty } from '@nestjs/swagger';

export type GithubUserDataType = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export class GithubProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  login: string;

  @ApiProperty({ required: false })
  name: string | null;

  @ApiProperty()
  avatarUrl: string;

  @ApiProperty()
  profileUrl: string;

  @ApiProperty({ required: false })
  bio: string | null;

  @ApiProperty({ required: false })
  company: string | null;

  @ApiProperty({ required: false })
  blog: string | null;

  @ApiProperty({ required: false })
  location: string | null;

  @ApiProperty({ required: false })
  email: string | null;

  @ApiProperty({ required: false })
  hireable: boolean | null;

  @ApiProperty({ required: false })
  twitterUsername: string | null;

  @ApiProperty()
  publicRepos: number;

  @ApiProperty()
  publicGists: number;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  allowImport: boolean;
}
