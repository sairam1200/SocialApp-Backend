import { LinkedAccount } from '../entities/linkedAccount.entity';
import {
  FacebookOnlineModel,
  FacebookProfileModel,
  FacebookSearchItemModel,
} from '../contracts/facebook.model';
import { ContentStream } from 'domain/entities';
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
    name: data.metaData.name,
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
    type: data.type ?? 'Feed',
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
