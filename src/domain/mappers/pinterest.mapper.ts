import { PinterestProfileModel } from "../contracts/pinterest.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";

export function mapToPinterestProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): PinterestProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    about: data.metaData.about,
    pinCount: data.metaData.pinCount,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    userName: data.userName,
    pinterestId: data.externalId,
    monthlyViews: data.metaData.monthlyViews,
    profileImage: data.profileImage,
    websiteUrl: data.metaData.websiteUrl,
  } as PinterestProfileModel;
}