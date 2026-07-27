import { Playlist } from '../entities/collection/playlist.entity';
import { PlaylistMember } from '../entities/collection/playlistMember.entity';
import { PlaylistContent } from '../entities/collection/playlistContent.entity';
import {
  PlaylistContentModel,
  PlaylistMemberModel,
  PlaylistModel,
} from '../contracts/playlist.model';

export function mapToPlaylistModel(userCollection: Playlist): PlaylistModel {
  return {
    id: userCollection.id,
    referenceId: userCollection.referenceId,
    name: userCollection.name,
    description: userCollection.description,
    playlistType: userCollection.playlistType,
    systemType: userCollection.systemType,
    contents: (userCollection.contents ?? []).map((content) =>
      mapToPlaylistContentModel(content),
    ),
    owner: {
      id: userCollection.owner.id,
      userName: userCollection.owner.userName,
      displayName: `${userCollection.owner.firstName} ${userCollection.owner.lastName}`,
    },
    members: (userCollection.members ?? []).map((member) =>
      mapToPlayListMemberModel(member),
    ),
    pinOrder: userCollection.pinOrder,
    isArchived: userCollection.isArchived,
    coverImage: userCollection.coverImage,
    icon: userCollection.icon,
    color: userCollection.color,
    lastViewedAt: userCollection.lastViewedAt,
  };
}

export function mapToPlayListMemberModel(
  member: PlaylistMember,
): PlaylistMemberModel {
  return {
    id: member.id,
    role: member.role,
    userId: member.user.id,
    userName: member.user.userName,
    playlistReferenceId: member.playlist.referenceId,
    displayName: `${member.user.firstName} ${member.user.lastName}`,
  };
}

export function mapToPlaylistContentModel(
  content: PlaylistContent,
): PlaylistContentModel {
  const uc = content.userContent;
  return {
    id: content.id,
    type: uc?.type ?? content.type,
    contentUrl: uc?.sourceUrl ?? content.contentUrl,
    thumbnailUrl: uc?.media?.[0]?.thumbnail ?? content.thumbnailUrl,
    title: uc?.title ?? content.title,
    description: uc?.text ?? content.description,
    platform: uc?.platform ?? content.platform,
    playlistReferenceId: content.playlist.referenceId,
    userContentId: content.userContentId,
    addedBy: {
      id: content.addedBy.id,
      role: content.addedBy.role,
      userName: content.addedBy.user.userName,
      displayName: `${content.addedBy.user.firstName} ${content.addedBy.user.lastName}`,
    },
    contentId: uc?.externalId ?? content.contentId,
  };
}
