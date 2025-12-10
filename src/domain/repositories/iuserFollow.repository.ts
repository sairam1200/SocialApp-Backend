import { FollowStatus } from "../enums";
import { UserFollow } from "../entities/userFollow.entity";

export interface IUserFollowRepository {
  getAsync(followerId: string, followedId: string): Promise<UserFollow | null>;
  getWithUsersAsync(followerId: string, followedId: string): Promise<UserFollow | null>;
  createAsync(follow: UserFollow): Promise<UserFollow>;
  deleteAsync(follow: UserFollow): Promise<void>;
  updateStatusAsync(followId: string, status: FollowStatus): Promise<boolean>;

  getFollowersAsync(userId: string, status: FollowStatus | null): Promise<UserFollow[]>;
  getFollowingAsync(userId: string, status: FollowStatus | null): Promise<UserFollow[]>;

  countFollowersAsync(userId: string, status?: FollowStatus): Promise<number>;
  countFollowingAsync(userId: string, status?: FollowStatus): Promise<number>;

  getCommonFollowersAsync(userAId: string, userBId: string, status?: FollowStatus): Promise<UserFollow[]>;
}
