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

@Injectable()
export class UserPreferenceRepository implements IUserPreferenceRepository {
  constructor(
    @InjectRepository(UserPreference)
    private readonly userPreferenceContext: Repository<UserPreference>,
  ) { }

  public async findByUserIdAsync(userId: string): Promise<UserPreference | null> {
    const cached = await this.getCachedPreferences(userId);
    if (cached) {
      return new UserPreference({
        userId,
        theme: cached.theme,
        notificationChannelsEnabled: cached.notificationChannelsEnabled,
      });
    }

    const preferences = await this.userPreferenceContext.findOne({ where: { userId } });
    if (preferences) {
      await this.setCachedPreferences(preferences);
    }

    return preferences;
  }

  public async saveAsync(preferences: UserPreference): Promise<UserPreference> {
    const saved = await this.userPreferenceContext.save(preferences);
    await this.setCachedPreferences(saved);
    return saved;
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
}
