import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { YoutubeChannelAnalytics } from '../../domain/entities/youtubeChannelAnalytics.entity';
import { IYoutubeChannelAnalyticsRepository } from '../../domain/repositories/iyoutubeChannelAnalytics.repository';

@Injectable()
export class YoutubeChannelAnalyticsRepository implements IYoutubeChannelAnalyticsRepository {
  constructor(
    @InjectRepository(YoutubeChannelAnalytics)
    private readonly channelAnalyticsContext: Repository<YoutubeChannelAnalytics>,
  ) {}

  async createOrUpdateAsync(analytics: YoutubeChannelAnalytics): Promise<YoutubeChannelAnalytics> {
    const existing = await this.channelAnalyticsContext.findOne({
      where: {
        channelId: analytics.channelId,
        snapshotDate: analytics.snapshotDate,
      },
    });

    if (existing) {
      Object.assign(existing, analytics);
      return await this.channelAnalyticsContext.save(existing);
    }

    const newEntity = this.channelAnalyticsContext.create(analytics);
    return await this.channelAnalyticsContext.save(newEntity);
  }

  async getLatestByChannelIdAsync(channelId: string): Promise<YoutubeChannelAnalytics | null> {
    return await this.channelAnalyticsContext.findOne({
      where: { channelId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAsync(userId: string): Promise<YoutubeChannelAnalytics | null> {
    return await this.channelAnalyticsContext.findOne({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getTrendsAsync(channelId: string, startDate: Date, endDate: Date): Promise<YoutubeChannelAnalytics[]> {
    return await this.channelAnalyticsContext.find({
      where: {
        channelId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }
}
