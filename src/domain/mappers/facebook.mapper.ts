import { LinkedAccount } from "../entities/linkedAccount.entity";
import { FacebookProfileModel } from "../contracts/facebook.model";

export function mapToFacebookProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): FacebookProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.userName,
    facebookId: data.externalId,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
  } as FacebookProfileModel;
}

