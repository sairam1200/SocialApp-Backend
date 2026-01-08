import { ApiProperty } from "@nestjs/swagger";
import { PlaylistMemberRole } from "../enums";

export class AddPlaylistContentModel {
  @ApiProperty()
  contentId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  contentUrl: string;

  @ApiProperty()
  thumbnailUrl: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  metadata?: Record<string, any>;
}

export class PlaylistContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  playlistReferenceId: string;

  @ApiProperty()
  contentId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  platform: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  thumbnailUrl: string;

  @ApiProperty({ type: Object, required: false })
  metadata?: Record<string, any>;

  @ApiProperty()
  contentUrl: string;

  @ApiProperty()
  addedBy: {
    id: string;
    role: PlaylistMemberRole;
    userName: string;
    displayName: string;
  };
}

export class PlaylistMemberModel {

  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  playlistReferenceId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: PlaylistMemberRole })
  role: PlaylistMemberRole;
}

export class PlaylistModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ type: [PlaylistContentModel], required: false })
  contents?: PlaylistContentModel[]

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string' },
      displayName: { type: 'string' },
      userName: { type: 'string' }
    }
  })
  owner: {
    id: string;
    displayName: string;
    userName: string;
  };

  @ApiProperty({ type: [PlaylistMemberModel], required: false })
  members?: PlaylistMemberModel[];

  @ApiProperty()
  referenceId: string;
}
