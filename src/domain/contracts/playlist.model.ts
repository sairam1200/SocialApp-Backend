import { ApiProperty } from "@nestjs/swagger";
import { PlaylistMemberRole } from "../enums";

export class PlaylistModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ type: [Object], required: false })
  content?: {
    [key: string]: any;
  };

  @ApiProperty()
  owner: {
    id: string;
    displayName: string;
    userName: string;
  };

  @ApiProperty({ type: [Object], required: false })
  members?: PlaylistMemberModel[];

  @ApiProperty()
  referenceId: string;
}

export class PlaylistMemberModel {

  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  playlistId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: PlaylistMemberRole })
  role: PlaylistMemberRole;
}