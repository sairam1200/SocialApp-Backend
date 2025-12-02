import { FollowModel } from "../contracts/follow.model";
import { UserFollow } from "../entities/userFollow.entity";

export function mapToFollowModel(follow: UserFollow): FollowModel {
  return {
    id: follow.id,
    status: follow.status,
    followedOn: follow.createdOn,
    follower: {
      id: follow.follower?.id ?? follow.followerId,
      userName: follow.follower?.userName,
      displayName: `${follow.follower?.firstName ?? ''} ${follow.follower?.lastName ?? ''}`.trim(),
    },
    followed: {
      id: follow.followed?.id ?? follow.followedId,
      userName: follow.followed?.userName,
      displayName: `${follow.followed?.firstName ?? ''} ${follow.followed?.lastName ?? ''}`.trim(),
    }
  };
}
