import { FollowModel } from '../contracts/follow.model';
import { UserFollow } from '../entities/userFollow.entity';

export function mapToFollowModel(follow: UserFollow): FollowModel {
  return {
    id: follow.id,
    status: follow.status,
    followedOn: follow.createdOn,
    follower: {
      id: follow.follower?.id ?? follow.followerId,
      userName: follow.follower?.userName,
      firstName: follow.follower?.firstName ?? '',
      lastName: follow.follower?.lastName ?? '',
      profileImage: follow.follower?.biometrics?.profileImageUrl,
    },
    followed: {
      id: follow.followed?.id ?? follow.followedId,
      userName: follow.followed?.userName,
      firstName: follow.followed?.firstName ?? '',
      lastName: follow.followed?.lastName ?? '',
      profileImage: follow.followed?.biometrics?.profileImageUrl,
    },
  };
}
