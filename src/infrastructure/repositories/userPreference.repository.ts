import _const from "../../core/utils/const";
import redis from "../../core/utils/redis.util";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserPreference } from "../../domain/entities";
import { IUserPreferenceRepository } from "../../domain/repositories/iuserPreference.repository";
import { NotificationChannel, Theme } from "../../domain/enums";

interface UserPreferenceCacheModel {
  theme: Theme;
  notificationChannelsEnabled: NotificationChannel[];
}

const defaultNotificationChannelsEnabled = [
  NotificationChannel.InApp,
  NotificationChannel.Email,
  NotificationChannel.Push,
];

@Injectable()
export class UserPreferenceRepository implements IUserPreferenceRepository {
  constructor(
    @InjectRepository(UserPreference)
    private readonly userPreferenceContext: Repository<UserPreference>,
  ) { }

  public async getPreferencesAsync(userId: string): Promise<UserPreference> {
    return await this.getOrCreatePreferencesAsync(userId, false);
  }

  public async updateThemeAsync(userId: string, theme: Theme): Promise<UserPreference> {
    const preferences = await this.getOrCreatePreferencesAsync(userId, true);
    preferences.theme = theme;
    preferences.setCurrentUser(userId);

    const updated = await this.userPreferenceContext.save(preferences);
    await this.setCachedPreferences(updated);
    return updated;
  }

  public async updateNotificationChannelsAsync(userId: string, channels: NotificationChannel[]): Promise<UserPreference> {
    const preferences = await this.getOrCreatePreferencesAsync(userId, true);
    preferences.notificationChannelsEnabled = this.normalizeChannels(channels);
    preferences.setCurrentUser(userId);

    const updated = await this.userPreferenceContext.save(preferences);
    await this.setCachedPreferences(updated);
    return updated;
  }

  private async getOrCreatePreferencesAsync(userId: string, skipCache: boolean): Promise<UserPreference> {
    if (!skipCache) {
      const cached = await this.getCachedPreferences(userId);
      if (cached) {
        return new UserPreference({
          userId,
          theme: cached.theme ?? Theme.System,
          notificationChannelsEnabled: this.normalizeChannels(cached.notificationChannelsEnabled),
        });
      }
    }

    let preferences = await this.userPreferenceContext.findOne({ where: { userId } });

    if (!preferences) {
      preferences = new UserPreference({
        userId,
        theme: Theme.System,
        notificationChannelsEnabled: [...defaultNotificationChannelsEnabled],
      });
      preferences.setCurrentUser(userId);
      preferences = await this.userPreferenceContext.save(preferences);
      await this.setCachedPreferences(preferences);
      return preferences;
    }

    let needsUpdate = false;

    if (!preferences.theme) {
      preferences.theme = Theme.System;
      needsUpdate = true;
    }

    const normalizedChannels = this.normalizeChannels(preferences.notificationChannelsEnabled);
    if (!this.areChannelsEqual(preferences.notificationChannelsEnabled, normalizedChannels)) {
      preferences.notificationChannelsEnabled = normalizedChannels;
      needsUpdate = true;
    }

    if (needsUpdate) {
      preferences.setCurrentUser(userId);
      preferences = await this.userPreferenceContext.save(preferences);
    }

    await this.setCachedPreferences(preferences);
    return preferences;
  }

  private getCacheKey(userId: string): string {
    return redis.getRedisKey<string>(`user:${userId}:${_const.REDIS.USER.PREFERENCES}`);
  }

  private async getCachedPreferences(userId: string): Promise<UserPreferenceCacheModel | null> {
    const key = this.getCacheKey(userId);
    return await redis.getFromRedisAsync<UserPreferenceCacheModel>(key);
  }

  private async setCachedPreferences(preferences: UserPreference): Promise<void> {
    const key = this.getCacheKey(preferences.userId);
    await redis.storeInRedisAsync(
      key,
      {
        theme: preferences.theme,
        notificationChannelsEnabled: preferences.notificationChannelsEnabled,
      },
      _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
    );
  }

  private normalizeChannels(channels?: NotificationChannel[]): NotificationChannel[] {
    if (!channels || channels.length === 0) {
      return [...defaultNotificationChannelsEnabled];
    }

    const enabled = new Set(channels);
    enabled.add(NotificationChannel.InApp);

    return defaultNotificationChannelsEnabled.filter(channel => enabled.has(channel));
  }

  private areChannelsEqual(
    left?: NotificationChannel[],
    right?: NotificationChannel[],
  ): boolean {
    if (!left || !right) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }
}
