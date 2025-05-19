import { InstagramProfileModel } from "../contracts/instagram.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";

export function mapToInstagramProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): InstagramProfileModel {
  return {
    accountType: data.metaData.accountType,
    biography: data.metaData.biography,
    email: includeSensitiveFields ? data.email : null,
    followerCount: data.followersCount,
    followingCount: data.followingCount,
    userName: data.userName,
    instagramId: data.externalId,
    mediaCount: data.metaData.mediaCount,
    profileImage: data.profileImage,
    websiteUrl: data.metaData.website,

  } as InstagramProfileModel;
}