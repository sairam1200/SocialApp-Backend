import {
  ManualProfileModel,
  ManualProfileSearchResponseModel,
} from '../contracts/manualProfile.model';
import { ManualProfile } from '../entities';

export function mapToManualProfileModel(
  data: ManualProfile,
): ManualProfileModel {
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
  profileImageUrl: string | null = null,
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
      profileImage: profileImageUrl || null,
      userName: data.user?.userName,
    },
  } as ManualProfileSearchResponseModel;
}
