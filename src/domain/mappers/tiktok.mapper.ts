import { LinkedAccount } from '../entities/linkedAccount.entity';
import { TikTokProfileModel } from '../contracts/tiktok.model';

export function mapToTikTokProfileModel(linkedAccount: LinkedAccount, allowImport: boolean): TikTokProfileModel {
  return {
    id: linkedAccount.externalId,
    username: linkedAccount.userName,
    displayName: linkedAccount.metaData?.displayName || linkedAccount.userName,
    avatarUrl: linkedAccount.profileImage || '',
    followersCount: linkedAccount.followersCount,
    followingCount: linkedAccount.followingCount,
    likesCount: linkedAccount.metaData?.likesCount || 0,
    videoCount: linkedAccount.metaData?.videoCount || 0,
    verified: linkedAccount.verified,
    platform: linkedAccount.platform,
    metaData: linkedAccount.metaData
  };
}
