import { User } from "../entities";
import { LinkedAccount } from "../entities";
import { ManualProfile } from "../entities";
import { ProfileModel } from "../contracts/profile.model";
import { mapToUserModel, mapToLinkedAccountsModel } from "./user.mapper";
import { mapToManualProfileModel } from "./manualProfile.mapper";

export function mapToProfileModel(
  user: User,
  linkedAccounts: LinkedAccount[],
  manualProfiles: ManualProfile[],
  includeSensitiveFields: boolean = false,
  profileImageUrl: string | null = null
): ProfileModel {
  return {
    user: mapToUserModel(user, includeSensitiveFields, profileImageUrl),
    linkedAccounts: linkedAccounts.map(mapToLinkedAccountsModel),
    manualProfiles: manualProfiles.map(mapToManualProfileModel),
  } as ProfileModel;
}

