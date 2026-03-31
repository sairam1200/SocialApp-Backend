import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";
import { YoutubeProfileModel, YouTubeContentModel } from "../contracts/youtube.model";
import _const from "../../core/utils/const";

export function mapToYoutubeProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): YoutubeProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.userName,
    name: data.metaData.name,
    youtubeId: data.externalId,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
    hd: data.metaData.hd,
    locale: data.metaData.locale,
    channel: data.metaData.channel,
  } as YoutubeProfileModel;
}

export function mapToYouTubeContentModel(data: UserContent): YouTubeContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    description: data.text || data.metaData?.description,
    thumbnailUrl: data.media?.[0]?.thumbnail || data.metaData?.thumbnailUrl || data.metaData?.thumbnails?.default?.url,
    publishedAt: data.publishedAt || data.metaData?.publishedAt,
    videoId: data.metaData?.videoId,
    channelId: data.metaData?.channelId,
    viewCount: data.engagement?.views ?? data.metaData?.viewCount,
    likeCount: data.engagement?.likes ?? data.metaData?.likeCount,
    commentCount: data.engagement?.comments ?? data.metaData?.commentCount,
    duration: data.metaData?.duration,
  } as YouTubeContentModel;
}