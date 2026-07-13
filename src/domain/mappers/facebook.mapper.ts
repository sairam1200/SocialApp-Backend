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
  const { type, externalId, title, ...rest } =
    mapToFacebookOnlineModel(content);

  facebookOnlineContent.type = StreamEntityType.Profile;
  facebookOnlineContent.subType = type;
  facebookOnlineContent.platform = _const.PLATFORMS.FACEBOOK;
  facebookOnlineContent.externalId = externalId;
  facebookOnlineContent.title = title;
  facebookOnlineContent.metaData = rest;

  return facebookOnlineContent;
}

export function mapContentStreamToFacebookOnlineModel(
  content: ContentStream,
): FacebookOnlineModel {
  const { type, externalId, title, ...rest } = content;
  return {
    id: content.id,
    type: content.subType,
    title: content.title,
    externalId: content.externalId,
    ...rest.metaData,
  } as FacebookOnlineModel;
}

export function mapUserContentToFacebookOnlineModel(
  content: ContentStream | UserContent,
): FacebookOnlineModel {
  const isContentStream = (
    c: ContentStream | UserContent,
  ): c is ContentStream => {
    return 'subType' in c;
  };

  const contentType = isContentStream(content) ? content.subType : content.type;
  const data = content as any; // Cast for easier access to optional normalized fields

  return {
    id: content.id,
    title: content.title,
    type: contentType,
    externalId: content.externalId,
    description:
      data.text || content.metaData?.description || content.metaData?.message,
    picture:
      data.media?.[0]?.url ||
      content.metaData?.imageUrl ||
      content.metaData?.full_picture,
    link:
      data.sourceUrl ||
      content.metaData?.link ||
      content.metaData?.permalinkUrl,
    message: data.text || content.metaData?.message,
    story: content.metaData?.story,
    from: content.metaData?.from,
    reactions: data.engagement?.likes ?? content.metaData?.analytics?.reactions,
    commentCount:
      data.engagement?.comments ?? content.metaData?.analytics?.comments,
    sharesCount: data.engagement?.shares ?? content.metaData?.analytics?.shares,
    permalinkUrl: data.sourceUrl || content.metaData?.permalink,
    createdAt:
      data.publishedAt ||
      content.metaData?.createdAt ||
      content.metaData?.createdTime,
    updatedAt: content.metaData?.updatedAt || content.metaData?.updated_time,
  } as FacebookOnlineModel;
}
