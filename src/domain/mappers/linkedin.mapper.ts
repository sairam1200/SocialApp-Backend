import { LinkedInProfileModel } from "../contracts/linkedin.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";

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
