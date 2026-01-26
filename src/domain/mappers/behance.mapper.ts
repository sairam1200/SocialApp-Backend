import { BehanceContentModel, BehanceProfileModel } from "../contracts/behance.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";

export function mapToBehanceProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): BehanceProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount || 0,
    followingCount: data.followingCount || 0,
    userName: data.userName,
    behanceId: data.externalId,
    displayName: data.metaData?.displayName || data.userName,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    location: data.metaData?.location,
    occupation: data.metaData?.occupation,
    projectCount: data.metaData?.projectCount || 0,
  } as BehanceProfileModel;
}

export function mapToBehanceContentModel(data: UserContent): BehanceContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    description: data.metaData?.description,
    imageUrl: data.metaData?.imageUrl,
    link: data.metaData?.link,
    createdAt: data.metaData?.createdAt,
    views: data.metaData?.views,
    likes: data.metaData?.likes,
  } as BehanceContentModel;
}
