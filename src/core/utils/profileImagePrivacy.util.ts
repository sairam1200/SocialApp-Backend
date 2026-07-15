import { FollowStatus, ProfileImagePrivacy } from '../../domain/enums';
import { IUserFollowRepository } from '../../domain/repositories/iuserFollow.repository';

export async function haveUsersInteracted(
  userId1: string,
  userId2: string,
  followRepository: IUserFollowRepository,
): Promise<boolean> {
  if (userId1 === userId2) {
    return true;
  }

  const [follow1, follow2] = await Promise.all([
    followRepository.getAsync(userId1, userId2),
    followRepository.getAsync(userId2, userId1),
  ]);

  return (
    follow1?.status === FollowStatus.Accepted &&
    follow2?.status === FollowStatus.Accepted
  );
}

export async function isProfileImageVisible(
  profileImagePrivacy: ProfileImagePrivacy,
  ownerUserId: string,
  viewerUserId: string | null,
  followRepository: IUserFollowRepository,
): Promise<boolean> {
  if (profileImagePrivacy === ProfileImagePrivacy.Everyone) {
    return true;
  }

  if (ownerUserId === viewerUserId) {
    return true;
  }

  if (!viewerUserId) {
    return false;
  }

  if (profileImagePrivacy === ProfileImagePrivacy.Interactions) {
    return await haveUsersInteracted(
      ownerUserId,
      viewerUserId,
      followRepository,
    );
  }

  return false;
}

export async function getProfileImageUrl(
  profileImageUrl: string | null | undefined,
  defaultProfileImageUrl: string,
  profileImagePrivacy: ProfileImagePrivacy,
  ownerUserId: string,
  viewerUserId: string | null,
  followRepository: IUserFollowRepository,
): Promise<string | null> {
  const canViewCustom = await isProfileImageVisible(
    profileImagePrivacy,
    ownerUserId,
    viewerUserId,
    followRepository,
  );

  if (canViewCustom && profileImageUrl) {
    return profileImageUrl;
  }

  return null;
}
