import { SnapchatContentModel, SnapchatProfileModel } from "../contracts/snapchat.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";

export function mapToSnapchatProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): SnapchatProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount || 0,
    followingCount: data.followingCount || 0,
    userName: data.userName,
    snapchatId: data.externalId,
    displayName: data.metaData?.displayName || data.userName,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
  } as SnapchatProfileModel;
}

export function mapToSnapchatContentModel(data: UserContent): SnapchatContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    description: data.metaData?.description,
    imageUrl: data.metaData?.imageUrl,
    videoUrl: data.metaData?.videoUrl,
    link: data.metaData?.link,
    createdAt: data.metaData?.createdAt,
  } as SnapchatContentModel;
}
