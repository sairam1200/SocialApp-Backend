import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FollowModel } from '../contracts/follow.model';
import { UserFollow } from '../entities/userFollow.entity';
import { PlaylistMember } from '../entities/collection/playlistMember.entity';
import { getProfileImageUrl } from '../../core/utils/profileImagePrivacy.util';

export function mapToFollowModel(
  follow: UserFollow,
  resolvedAvatars?: Map<string, string | null>,
): FollowModel {
  const followerId = follow.follower?.id ?? follow.followerId;
  const followedId = follow.followed?.id ?? follow.followedId;

  return {
    id: follow.id,
    status: follow.status,
    followedOn: follow.createdOn,
    follower: {
      id: followerId,
      userName: follow.follower?.userName,
      firstName: follow.follower?.firstName ?? '',
      lastName: follow.follower?.lastName ?? '',
      profileImage: resolvedAvatars?.get(followerId) ?? null,
    },
    followed: {
      id: followedId,
      userName: follow.followed?.userName,
      firstName: follow.followed?.firstName ?? '',
      lastName: follow.followed?.lastName ?? '',
      profileImage: resolvedAvatars?.get(followedId) ?? null,
    },
  };
}

export async function resolveFollowAvatars(
  follows: UserFollow[],
  viewerUserId: string,
  playlistMemberRepository: Repository<PlaylistMember>,
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const processed = new Set<string>();

  for (const follow of follows) {
    const followerId = follow.follower?.id ?? follow.followerId;
    const followedId = follow.followed?.id ?? follow.followedId;

    if (followerId && !processed.has(followerId) && follow.follower?.biometrics) {
      const url = await getProfileImageUrl(
        follow.follower.biometrics.profileImageUrl,
        follow.follower.biometrics.defaultProfileImageUrl,
        follow.follower.biometrics.privacy,
        followerId,
        viewerUserId,
        playlistMemberRepository,
      );
      resolved.set(followerId, url);
      processed.add(followerId);
    }

    if (followedId && !processed.has(followedId) && follow.followed?.biometrics) {
      const url = await getProfileImageUrl(
        follow.followed.biometrics.profileImageUrl,
        follow.followed.biometrics.defaultProfileImageUrl,
        follow.followed.biometrics.privacy,
        followedId,
        viewerUserId,
        playlistMemberRepository,
      );
      resolved.set(followedId, url);
      processed.add(followedId);
    }
  }

  return resolved;
}
