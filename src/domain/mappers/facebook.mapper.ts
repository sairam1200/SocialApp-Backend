import { LinkedAccount } from '../entities/linkedAccount.entity';
import {
  FacebookOnlineModel,
  FacebookProfileModel,
  FacebookSearchItemModel,
} from '../contracts/facebook.model';
import { ContentStream, UserContent } from 'domain/entities';
import { StreamEntityType } from 'domain/enums';
import _const from 'core/utils/const';

export function mapToFacebookProfileModel(
  data: LinkedAccount,
  includeSensitiveFields: boolean = false,
): FacebookProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.userName,
    name: data.metaData.facebookUserName,
    facebookId: data.externalId,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
  } as FacebookProfileModel;
}

export function mapToFacebookOnlineModel(
  data: FacebookSearchItemModel,
): FacebookOnlineModel {
  return {
    id: data.id,
    title: data.name ?? data.message ?? 'Facebook Post',
    type: data.type ?? 'feed',
    platform: _const.PLATFORMS.FACEBOOK,
    externalId: data.id,
    description: data.description ?? '',
    picture: data.full_picture,
    link: data.link,
    message: data.message,
    from: data.from,
    reactions: data.reactions,
    commentCount: data.comments?.length,
    sharesCount: data.shares?.count,
    permalinkUrl: data.permalink_url,
    createdAt: data.created_time,
    updatedAt: data.updated_time,
  } as FacebookOnlineModel;
}

export function mapFacebookOnlineResponseToContentStream(
  content: FacebookSearchItemModel,
): ContentStream {
  const facebookOnlineContent = new ContentStream();
  const { type, externalId, title, ...rest } = mapToFacebookOnlineModel(content);

  facebookOnlineContent.type = StreamEntityType.Profile;
  facebookOnlineContent.subType = type;
  facebookOnlineContent.platform = _const.PLATFORMS.FACEBOOK;
  facebookOnlineContent.externalId = externalId;
  facebookOnlineContent.title = title;
  facebookOnlineContent.metaData = rest;

  return facebookOnlineContent;
}

export function mapContentStreamToFacebookOnlineModel(content: ContentStream): FacebookOnlineModel {
  const { type, externalId, title, ...rest } = content
  return {
    id: content.id,
    type: content.subType,
    title: content.title,
    externalId: content.externalId,
    ...rest.metaData
  } as FacebookOnlineModel
}

export function mapUserContentToFacebookOnlineModel(
  content: ContentStream | UserContent
): FacebookOnlineModel {
  const isContentStream = (
    c: ContentStream | UserContent,
  ): c is ContentStream => {
    return "subType" in c;
  };

  const contentType = isContentStream(content)
    ? content.subType
    : content.type;

  return {
  id: content.id,
  title: content.title,
  type: contentType,
  externalId: content.externalId,

  postId: content.metaData?.postId,

  description: content.metaData?.description,

  picture: content.metaData?.imageUrl,

  message: content.metaData?.message,

  permalinkUrl: content.metaData?.permalink,

  createdAt: content.metaData?.createdTime,

  link: content.metaData?.link,

  story: content.metaData?.story,

  from: content.metaData?.from,

  reactions: content.metaData?.analytics?.reactions,

  commentCount: content.metaData?.analytics?.comments,

  sharesCount: content.metaData?.sharesCount,

  reach: content.metaData?.analytics?.reach,

  totalReactions:
    content.metaData?.analytics?.totalReactions,

  reactionsByType:
    content.metaData?.analytics?.reactionsByType,

  engagement:
    content.metaData?.analytics?.engagement,

  engagementRate:
    content.metaData?.analytics?.engagementRate,

  updatedAt: content.metaData?.updatedAt,
} as FacebookOnlineModel; 
}