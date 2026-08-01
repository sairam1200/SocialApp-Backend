import { ApiProperty } from '@nestjs/swagger';

export class DiscoverContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ nullable: true })
  linkedAccountId: string | null;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  userHandle: string;

  @ApiProperty({ nullable: true })
  userProfileImage: string | null;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;

  @ApiProperty({ nullable: true })
  publishedAt: Date | null;

  @ApiProperty({ nullable: true })
  sourceUrl: string | null;

  @ApiProperty({ nullable: true })
  views: number | null;

  @ApiProperty({ nullable: true })
  likes: number | null;

  @ApiProperty({ nullable: true })
  comments: number | null;

  @ApiProperty()
  verified: boolean;

  @ApiProperty({ nullable: true })
  profileUrl: string | null;

  constructor(partial?: Partial<DiscoverContentModel>) {
    Object.assign(this, partial);
    this.verified = this.verified ?? false;
    this.profileUrl = this.profileUrl ?? null;
  }
}
