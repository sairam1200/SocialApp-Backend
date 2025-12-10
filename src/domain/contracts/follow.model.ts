import { ApiProperty } from "@nestjs/swagger";
import { FollowStatus } from "../enums";

export class FollowUserSummaryModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ required: false })
  profileImage?: string;
}

export class FollowModel {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: FollowStatus })
  status: FollowStatus;

  @ApiProperty({ type: FollowUserSummaryModel })
  follower: FollowUserSummaryModel;

  @ApiProperty({ type: FollowUserSummaryModel })
  followed: FollowUserSummaryModel;

  @ApiProperty()
  followedOn: Date;
}

export class FollowCountsModel {
  @ApiProperty()
  followers: number;

  @ApiProperty()
  following: number;
}
