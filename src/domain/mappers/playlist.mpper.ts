import { Playlist } from "../entities/playlist.entity";
import { PlaylistModel } from "../contracts/playlist.model";
import { PlaylistMember } from "../entities/playlistMember.entity";

export function mapToPlaylistModel(userCollection: Playlist): PlaylistModel {
  return {
    id: userCollection.id,
    referenceId: userCollection.referenceId,
    name: userCollection.name,
    description: userCollection.description,
    content: userCollection.metadata,
    owner: {
      id: userCollection.owner.id,
      userName: userCollection.owner.userName,
      displayName: `${userCollection.owner.firstName} ${userCollection.owner.lastName}`,
    },
    members: userCollection.members.map(member => (mapToPlayListMemberModel(member))),
  };
}

export function mapToPlayListMemberModel(member: PlaylistMember): any {
  return {
    id: member.id,
    role: member.role,
    userId: member.user.id,
    userName: member.user.userName,
    playlistId: member.playlist.id,
    displayName: `${member.user.firstName} ${member.user.lastName}`,
  };
}