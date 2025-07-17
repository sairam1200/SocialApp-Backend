import { ManualProfile } from "../entities/manualProfile.entity";

export interface IManualProfileRepository {
  getByUserIdAsync(userId: string): Promise<ManualProfile[]>;
  getByIdAsync(id: string): Promise<ManualProfile | null>;
  getByUserIdAndPlatformAsync(userId: string, platform: string): Promise<ManualProfile>;

  updateAsync(manualProfile: ManualProfile): Promise<void>;
  deleteAsync(manualProfile: ManualProfile): Promise<void>;
  reorderAsync(id: string, displayOrder: number): Promise<void>;
  createAsync(manualProfile: Partial<ManualProfile>): Promise<ManualProfile>;


}