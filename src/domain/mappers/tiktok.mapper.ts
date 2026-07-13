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
    url: data.sourceUrl || data.metaData?.shareUrl || data.metaData?.embedUrl || '',
    createdAt: data.publishedAt
      ? data.publishedAt
      : data.metaData?.createTime
        ? new Date(data.metaData.createTime * 1000)
        : new Date(),
    mediaUrl: data.media?.[0]?.url || data.metaData?.mediaUrl || '',
    thumbnailUrl: data.media?.[0]?.thumbnail || data.metaData?.coverImageUrl || '',
    caption: data.text || data.metaData?.videoDescription || '',
    title: data.title,
    stats: {
      likes: data.engagement?.likes ?? (data.metaData?.likeCount || 0),
      comments: data.engagement?.comments ?? (data.metaData?.commentCount || 0),
      shares: data.engagement?.shares ?? (data.metaData?.shareCount || 0),
      views: data.engagement?.views ?? (data.metaData?.viewCount || 0),
    },
    duration: data.metaData?.videoDuration || 0,
    dimensions: {
      height: data.metaData?.height || 0,
      width: data.metaData?.width || 0,
    },
  } as TikTokContentModel;
}
