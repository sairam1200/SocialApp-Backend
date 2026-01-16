import { LinkedInContentModel, LinkedInProfileModel } from "../contracts/linkedin.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";
import _const from "../../core/utils/const";

export function mapToLinkedInProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): LinkedInProfileModel {
  return {
    firstName: data.metaData.firstName,
    lastName: data.metaData.lastName,
    headline: data.metaData.headline,
    industry: data.metaData.industry,
    location: data.metaData.location,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    userName: data.userName,
    linkedInId: data.externalId,
    profileImage: data.profileImage,
    allowImport: data.allowImport,
    id: data.id,
  } as LinkedInProfileModel;
}

export function mapToLinkedInContentModel(data: UserContent): LinkedInContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    text: data.metaData?.text?.text || data.metaData?.commentary?.text || data.metaData?.commentary,
    commentary: data.metaData?.commentary,
    author: data.metaData?.author,
    created: data.metaData?.created,
    lastModified: data.metaData?.lastModified,
    activity: data.metaData?.activity,
  } as LinkedInContentModel;
}
