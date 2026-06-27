import { ApiProperty } from "@nestjs/swagger";
import { LinkedAccountModel } from './linked-account.model';

export class PublicProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
  
  @ApiProperty()
  DisplayName: string;

  @ApiProperty({ required: false, nullable: true })
  bio?: string | null;

  @ApiProperty({ required: false, nullable: true })
  profileImage?: string | null;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;

  @ApiProperty({ default: 0 })
  connectedPlatformsCount: number;
  
   @ApiProperty({ required: false, type: [LinkedAccountModel] })
linkedAccounts?: LinkedAccountModel[];

  @ApiProperty({ default: 0 })
  totalPosts: number;

  @ApiProperty({ default: 0 })
  engagementRate: number;

  @ApiProperty({ required: false, nullable: true })
  niche?: string | null;

  @ApiProperty({ default: false })
  verified: boolean;

  @ApiProperty({ required: false, default: false })
  isFollowing?: boolean;

  constructor(partial?: Partial<PublicProfileModel>) {
    Object.assign(this, partial);
  }
}
