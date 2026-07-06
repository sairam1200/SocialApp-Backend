import { UserPreference } from '../entities';

export interface IUserPreferenceRepository {
  getByUserIdAsync(userId: string): Promise<UserPreference | null>;
  createAsync(preferences: UserPreference): Promise<UserPreference>;
  updateAsync(preferences: UserPreference): Promise<void>;
}
