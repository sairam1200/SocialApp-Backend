import { LinkedAccount } from "../entities/linkedAccount.entity";
import { FacebookProfileModel } from "../contracts/facebook.model";

export function mapToFacebookProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): FacebookProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.username,
    facebookId: data.externalId,
    profileImage: data.profileImage,
    followerCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
  } as FacebookProfileModel;
}

