import { ManualProfileModel } from "../contracts/manualProfile.model";
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