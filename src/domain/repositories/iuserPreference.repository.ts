import { UserPreference } from "../entities";
import { NotificationChannel, Theme } from "../enums";

export interface IUserPreferenceRepository {
  getPreferencesAsync(userId: string): Promise<UserPreference>;
  updateThemeAsync(userId: string, theme: Theme): Promise<UserPreference>;
  updateNotificationChannelsAsync(userId: string, channels: NotificationChannel[]): Promise<UserPreference>;
}
