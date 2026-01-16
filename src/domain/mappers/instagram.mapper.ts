import { InstagramContentModel, InstagramProfileModel } from "../contracts/instagram.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";
import _const from "../../core/utils/const";

export function mapToInstagramProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): InstagramProfileModel {
  return {
    accountType: data.metaData.accountType,
    biography: data.metaData.biography,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    userName: data.userName,
    instagramId: data.externalId,
    mediaCount: data.metaData.mediaCount,
    profileImage: data.profileImage,
    allowImport: data.allowImport,
    websiteUrl: data.metaData.websiteUrl,

  } as InstagramProfileModel;
}

export function mapToInstagramContentModel(data: UserContent): InstagramContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    caption: data.metaData?.caption,
    mediaType: data.metaData?.mediaType,
    mediaUrl: data.metaData?.mediaUrl,
    permalink: data.metaData?.permalink,
    thumbnailUrl: data.metaData?.thumbnailUrl,
    timestamp: data.metaData?.timestamp,
    username: data.metaData?.username,
    likeCount: data.metaData?.likeCount,
    commentsCount: data.metaData?.commentsCount,
  } as InstagramContentModel;
}