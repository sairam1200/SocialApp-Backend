import { LinkedAccount } from "../entities";
import { User } from "../entities/user.entity";
import { LinkedAccountModel, UserModel } from "../contracts/user.model";

export function mapToUserModel(user: User): UserModel {
  return {
    id: user.id,
    email: user.email,
    gender: user.gender,
    lastName: user.lastName,
    photo: user.profileImage,
    firstName: user.firstName,
    phoneNumber: user.phoneNumber,
    isEmailVerified: user.emailConfirmed,
  } as UserModel;
}

export function mapToLinkedAccountsModel(linkedAccount: LinkedAccount): LinkedAccountModel {
  return {
    id:linkedAccount.id,
    username:linkedAccount.userName,
    isImported:linkedAccount.allowImport,
    externalUrl: linkedAccount.externalUrl,
    isVerified: linkedAccount.verified,
    platform: linkedAccount.platform,
  } as LinkedAccountModel;
}
