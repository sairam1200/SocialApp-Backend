import { ManualProfileModel, ManualProfileSearchResponseModel } from "../contracts/manualProfile.model";
import { ManualProfile } from "../entities";

export function mapToManualProfileModel(data: ManualProfile): ManualProfileModel {
  return {
    id: data.id,
    icon: data.icon,
    platform: data.platform,
    url: data.url,
    displayOrder: data.displayOrder,
  } as ManualProfileModel;
}

export function mapToManualProfileSearchResponseModel(
  data: ManualProfile,
  canViewProfileImage: boolean = true
): ManualProfileSearchResponseModel {
  return {
    id: data.id,
    icon: data.icon,
    platform: data.platform,
    url: data.url,
    displayOrder: data.displayOrder,
    user: {
      firstName: data.user?.firstName,
      lastName: data.user?.lastName,
      profileImage: canViewProfileImage ? data.user?.profileImage : null,
      userName: data.user?.userName
    }
  } as ManualProfileSearchResponseModel;
}