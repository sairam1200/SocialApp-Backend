import { User } from "../entities";
import { LinkedAccount } from "../entities";
import { ManualProfile } from "../entities";
import { ProfileModel } from "../contracts/profile.model";
import { mapToManualProfileModel } from "./manualProfile.mapper";
import { mapToUserModel, mapToLinkedAccountsModel } from "./user.mapper";

export function mapToProfileModel(
  user: User,
  linkedAccounts: LinkedAccount[],
  manualProfiles: ManualProfile[],
  includeSensitiveFields: boolean = false,
  profileImageUrl: string | null = null,
  followersCount: number = 0,
  followingCount: number = 0
): ProfileModel {
  const userModel = mapToUserModel(user, includeSensitiveFields, profileImageUrl);
  return new ProfileModel({
    ...userModel,
    linkedAccounts: linkedAccounts.map(mapToLinkedAccountsModel),
    manualProfiles: manualProfiles.map(mapToManualProfileModel),
    followersCount,
    followingCount,
  });
}

