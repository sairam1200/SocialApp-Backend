import { ApiProperty } from "@nestjs/swagger";

export class FollowStatusModel {
  @ApiProperty()
  isFollowing: boolean;

  @ApiProperty()
  requested: boolean;

  @ApiProperty()
  canFollow: boolean;
}
