import { LinkedAccount } from '../entities/linkedAccount.entity';
import { TiktokProfileModel } from '../contracts/tiktok.model';

export function mapToTiktokProfileModel(linkedAccount: LinkedAccount, includeSensitiveFields: boolean): TiktokProfileModel {
  return {
    id: linkedAccount.externalId,
    username: linkedAccount.userName,
    displayName: linkedAccount.metaData?.displayName,
    avatarUrl: linkedAccount.profileImage || '',
    followersCount: linkedAccount.followersCount,
    followingCount: linkedAccount.followingCount,
    likesCount: linkedAccount.metaData?.likesCount || 0,
    videoCount: linkedAccount.metaData?.videoCount || 0,
    verified: linkedAccount.verified,
  };
}
