import { LinkedAccount } from '../entities/linkedAccount.entity';
import { UserContent } from '../entities/userContent.entity';
import {
  TiktokProfileModel,
  TikTokContentModel,
} from '../contracts/tiktok.model';
import _const from '../../core/utils/const';

export function mapToTiktokProfileModel(
  linkedAccount: LinkedAccount,
  includeSensitiveFields: boolean,
): TiktokProfileModel {
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

export function mapToTikTokContentModel(data: UserContent): TikTokContentModel {
  return {
    id: data.id,
    type: data.type,
    url: data.metaData?.shareUrl || data.metaData?.embedUrl || '',
    createdAt: data.metaData?.createTime
      ? new Date(data.metaData.createTime * 1000)
      : new Date(),
    mediaUrl: data.metaData?.mediaUrl || '',
    thumbnailUrl: data.metaData?.coverImageUrl || '',
    caption: data.metaData?.videoDescription || '',
    title: data.title,
    stats: {
      likes: data.metaData?.likeCount || 0,
      comments: data.metaData?.commentCount || 0,
      shares: data.metaData?.shareCount || 0,
      views: data.metaData?.viewCount || 0,
    },
    duration: data.metaData?.videoDuration || 0,
    dimensions: {
      height: data.metaData?.height || 0,
      width: data.metaData?.width || 0,
    },
  } as TikTokContentModel;
}
