import { LinkedAccount } from "../entities";
import { User } from "../entities";
import { LinkedAccountModel, UserModel } from "../contracts/user.model";

export function mapToUserModel(
  user: User,
  includeSensitiveFields: boolean = true,
  profileImageUrl: string | null = null
): UserModel {
  return {
    id: user.id,
    email: includeSensitiveFields ? user.email : null,
    gender: user.gender,
    lastName: user.lastName,
    photo: profileImageUrl || null,
    firstName: user.firstName,
    phoneNumber: includeSensitiveFields ? user.phoneNumber : null,
    isEmailVerified: includeSensitiveFields ? user.emailConfirmed : null,
  } as UserModel;
}

export function mapToLinkedAccountsModel(linkedAccount: LinkedAccount): LinkedAccountModel {
  return {
    id: linkedAccount.id,
    username: linkedAccount.userName,
    isImported: linkedAccount.allowImport,
    externalId: linkedAccount.externalId,
    externalUrl: linkedAccount.externalUrl,
    followersCount: linkedAccount.followersCount,
    followingCount: linkedAccount.followingCount,
    isVerified: linkedAccount.verified,
    platform: linkedAccount.platform,
  } as LinkedAccountModel;
}
