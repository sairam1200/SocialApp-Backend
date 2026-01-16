import { PinterestContentModel, PinterestProfileModel } from "../contracts/pinterest.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";
import _const from "../../core/utils/const";

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
    allowImport: data.allowImport,
    monthlyViews: data.metaData.monthlyViews,
    profileImage: data.profileImage,
    websiteUrl: data.metaData.websiteUrl,
  } as PinterestProfileModel;
}

export function mapToPinterestContentModel(data: UserContent): PinterestContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    description: data.metaData?.description,
    imageUrl: data.metaData?.imageUrl,
    boardId: data.metaData?.boardId,
    boardName: data.metaData?.boardName,
    link: data.metaData?.link,
    createdAt: data.metaData?.createdAt,
    pinCount: data.metaData?.pinCount,
  } as PinterestContentModel;
}