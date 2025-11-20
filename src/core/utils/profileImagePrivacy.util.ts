import { Repository } from "typeorm";
import { PlaylistMember } from "../../domain/entities/collection/playlistMember.entity";
import { ProfileImagePrivacy } from "../../domain/enums";

/**
 * Checks if two users have interacted (are in the same playlists)
 * @param userId1 First user ID
 * @param userId2 Second user ID
 * @param playlistMemberRepository PlaylistMember repository
 * @returns true if users have interacted (are in at least one shared playlist)
 */
export async function haveUsersInteracted(
  userId1: string,
  userId2: string,
  playlistMemberRepository: Repository<PlaylistMember>
): Promise<boolean> {
  if (userId1 === userId2) {
    return true; // User can always see their own profile image
  }

  // Check if both users are members of the same playlist
  const sharedPlaylists = await playlistMemberRepository
    .createQueryBuilder('pm1')
    .innerJoin(
      'playlistMembers',
      'pm2',
      'pm1.playlistId = pm2.playlistId AND pm1.userId != pm2.userId'
    )
    .where('pm1.userId = :userId1', { userId1 })
    .andWhere('pm2.userId = :userId2', { userId2 })
    .andWhere('pm1.removedAt IS NULL')
    .andWhere('pm2.removedAt IS NULL')
    .getCount();

  return sharedPlaylists > 0;
}

/**
 * Determines if a profile image should be visible based on privacy settings
 * @param profileImagePrivacy Privacy setting for the profile image
 * @param ownerUserId User ID of the profile image owner
 * @param viewerUserId User ID of the viewer (current user)
 * @param playlistMemberRepository PlaylistMember repository
 * @returns true if profile image should be visible to the viewer
 */
export async function isProfileImageVisible(
  profileImagePrivacy: ProfileImagePrivacy,
  ownerUserId: string,
  viewerUserId: string | null,
  playlistMemberRepository: Repository<PlaylistMember>
): Promise<boolean> {
  // If privacy is set to Everyone, always visible
  if (profileImagePrivacy === ProfileImagePrivacy.Everyone) {
    return true;
  }

  // If no viewer or viewer is the owner, always visible
  if (!viewerUserId || ownerUserId === viewerUserId) {
    return true;
  }

  // If privacy is set to Interactions, check if users have interacted
  if (profileImagePrivacy === ProfileImagePrivacy.Interactions) {
    return await haveUsersInteracted(ownerUserId, viewerUserId, playlistMemberRepository);
  }

  return false;
}

