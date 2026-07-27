import { ApiProperty } from '@nestjs/swagger';
import { PlaylistMemberRole } from '../enums';

export class AddPlaylistContentModel {
  @ApiProperty({ required: false })
  userContentId?: string;

  @ApiProperty({ required: false })
  contentId?: string;

  @ApiProperty({ required: false })
  type?: string;

  @ApiProperty({ required: false })
  platform?: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  contentUrl?: string;

  @ApiProperty({ required: false })
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;
}

export class PlaylistContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  playlistReferenceId: string;

  @ApiProperty({ required: false })
  userContentId?: string;

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

  @ApiProperty({ required: false })
  playlistType?: string;

  @ApiProperty({ required: false })
  systemType?: string;

  @ApiProperty({ type: [PlaylistContentModel], required: false })
  contents?: PlaylistContentModel[];

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string' },
      displayName: { type: 'string' },
      userName: { type: 'string' },
    },
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

  @ApiProperty({ required: false })
  pinOrder?: number;

  @ApiProperty({ required: false })
  isArchived?: boolean;

  @ApiProperty({ required: false })
  coverImage?: string;

  @ApiProperty({ required: false })
  icon?: string;

  @ApiProperty({ required: false })
  color?: string;

  @ApiProperty({ required: false })
  lastViewedAt?: Date;
}
