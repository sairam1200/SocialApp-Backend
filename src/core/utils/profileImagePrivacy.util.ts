import { Repository } from "typeorm";
import { PlaylistMember } from "../../domain/entities/collection/playlistMember.entity";
import { ProfileImagePrivacy } from "../../domain/enums";

export async function haveUsersInteracted(
  userId1: string,
  userId2: string,
  playlistMemberRepository: Repository<PlaylistMember>
): Promise<boolean> {
  if (userId1 === userId2) {
    return true;
  }

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

export async function isProfileImageVisible(
  profileImagePrivacy: ProfileImagePrivacy,
  ownerUserId: string,
  viewerUserId: string | null,
  playlistMemberRepository: Repository<PlaylistMember>
): Promise<boolean> {
  if (profileImagePrivacy === ProfileImagePrivacy.Everyone) {
    return true;
  }

  if (!viewerUserId || ownerUserId === viewerUserId) {
    return true;
  }

  if (profileImagePrivacy === ProfileImagePrivacy.Interactions) {
    return await haveUsersInteracted(ownerUserId, viewerUserId, playlistMemberRepository);
  }

  return false;
}

export async function getProfileImageUrl(
  profileImageUrl: string | null | undefined,
  defaultProfileImageUrl: string,
  profileImagePrivacy: ProfileImagePrivacy,
  ownerUserId: string,
  viewerUserId: string | null,
  playlistMemberRepository: Repository<PlaylistMember>
): Promise<string> {
  // If viewer can see the custom image, return it (or default if no custom)
  const canViewCustom = await isProfileImageVisible(
    profileImagePrivacy,
    ownerUserId,
    viewerUserId,
    playlistMemberRepository
  );

  // If privacy allows and custom image exists, return custom; otherwise return default
  if (canViewCustom && profileImageUrl) {
    return profileImageUrl;
  }

  // Return default image (always available, even when privacy restricts custom image)
  return defaultProfileImageUrl;
}

