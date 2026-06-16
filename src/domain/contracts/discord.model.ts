import { ApiProperty } from '@nestjs/swagger';

export type DiscordUserDataType = {
  id: string;
  username: string;
  global_name: string | null;
  discriminator: string;
  avatar: string | null;
  verified: boolean;
  email: string | null;
  flags: number;
  banner: string | null;
  accent_color: number | null;
  premium_type: number;
  public_flags: number;
}

export class DiscordProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ required: false })
  globalName: string | null;

  @ApiProperty({ required: false })
  avatarUrl: string | null;

  @ApiProperty()
  profileUrl: string;

  @ApiProperty({ required: false })
  email: string | null;

  @ApiProperty()
  verified: boolean;

  @ApiProperty({ required: false })
  bannerColor: number | null;

  @ApiProperty()
  premiumType: number;

  @ApiProperty()
  allowImport: boolean;
}
