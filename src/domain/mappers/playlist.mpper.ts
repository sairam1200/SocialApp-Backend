import { Playlist } from "../entities/collection/playlist.entity";
import { PlaylistMember } from "../entities/collection/playlistMember.entity";
import { PlaylistContent } from "../entities/collection/playlistContent.entity";
import { PlaylistContentModel, PlaylistMemberModel, PlaylistModel } from "../contracts/playlist.model";

export function mapToPlaylistModel(userCollection: Playlist): PlaylistModel {
  return {
    id: userCollection.id,
    referenceId: userCollection.referenceId,
    name: userCollection.name,
    description: userCollection.description,
    contents: userCollection.contents.map(content => (mapToPlaylistContentModel(content))),
    owner: {
      id: userCollection.owner.id,
      userName: userCollection.owner.userName,
      displayName: `${userCollection.owner.firstName} ${userCollection.owner.lastName}`,
    },
    members: userCollection.members.map(member => (mapToPlayListMemberModel(member))),
  };
}

export function mapToPlayListMemberModel(member: PlaylistMember): PlaylistMemberModel {
  return {
    id: member.id,
    role: member.role,
    userId: member.user.id,
    userName: member.user.userName,
    playlistReferenceId: member.playlist.referenceId,
    displayName: `${member.user.firstName} ${member.user.lastName}`,
  };
}

export function mapToPlaylistContentModel(content: PlaylistContent): PlaylistContentModel {
  return {
    id: content.id,
    type: content.type,
    contentUrl: content.contentUrl,
    thumbnailUrl: content.thumbnailUrl,
    title: content.title,
    description: content.description,
    platform: content.platform,
    playlistReferenceId: content.playlist.referenceId,
    addedBy: {
      id: content.addedBy.id,
      role: content.addedBy.role,
      userName: content.addedBy.user.userName,
      displayName: `${content.addedBy.user.firstName} ${content.addedBy.user.lastName}`,
    },
    contentId: content.contentId,
  };
}