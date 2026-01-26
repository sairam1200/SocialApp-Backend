import { UserPreference } from "../entities";

export interface IUserPreferenceRepository {
  findByUserIdAsync(userId: string): Promise<UserPreference | null>;
  saveAsync(preferences: UserPreference): Promise<UserPreference>;
}
