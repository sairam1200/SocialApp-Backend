import { PublicProfileModel } from '../contracts/public-profile.model';
import { LinkedAccountModel } from '../contracts/linked-account.model';
import { User } from '../entities';

type PublicProfileMapperInput = {
  user: User;
  profileImage: string | null;
  followersCount: number;
  followingCount: number;
  connectedPlatformsCount: number;
  totalPosts: number;
  engagementRate?: number;
  niche?: string | null;
  isFollowing?: boolean;
  linkedAccounts?: LinkedAccountModel[];
};

export function mapToPublicProfileModel(
  input: PublicProfileMapperInput,
): PublicProfileModel {
  const userWithVerified = input.user as User & { verified?: boolean };

  return new PublicProfileModel({
    id: input.user.id,
    userName: input.user.userName ?? '',
    firstName: input.user.firstName ?? '',
    lastName: input.user.lastName ?? '',
    DisplayName:
      `${input.user.firstName ?? ''} ${input.user.lastName ?? ''}`.trim(),
    bio: input.user.bio ?? null,
    profileImage: input.profileImage,
    linkedAccounts: input.linkedAccounts,
    followersCount: input.followersCount,
    followingCount: input.followingCount,
    connectedPlatformsCount: input.connectedPlatformsCount,
    totalPosts: input.totalPosts,
    engagementRate: input.engagementRate ?? 0,
    niche: input.niche ?? null,
    verified: userWithVerified.verified ?? false,
    isFollowing: input.isFollowing ?? false,
  });
}
