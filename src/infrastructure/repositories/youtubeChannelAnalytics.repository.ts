import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { YoutubeChannelAnalytics } from '../../domain/entities/youtubeChannelAnalytics.entity';
import {
  ChannelMetricsAggregate,
  IYoutubeChannelAnalyticsRepository,
} from '../../domain/repositories/iyoutubeChannelAnalytics.repository';

@Injectable()
export class YoutubeChannelAnalyticsRepository implements IYoutubeChannelAnalyticsRepository {
  constructor(
    @InjectRepository(YoutubeChannelAnalytics)
    private readonly channelAnalyticsContext: Repository<YoutubeChannelAnalytics>,
  ) {}

  async createOrUpdateAsync(
    analytics: YoutubeChannelAnalytics,
  ): Promise<YoutubeChannelAnalytics> {
    const existing = await this.channelAnalyticsContext.findOne({
      where: {
        channelId: analytics.channelId,
        snapshotDate: analytics.snapshotDate,
      },
    });

    if (existing) {
      const merged = this.channelAnalyticsContext.merge(existing, analytics);
      return await this.channelAnalyticsContext.save(merged);
    }

    const newEntity = this.channelAnalyticsContext.create(analytics);
    return await this.channelAnalyticsContext.save(newEntity);
  }

  async getLatestByChannelIdAsync(
    channelId: string,
  ): Promise<YoutubeChannelAnalytics | null> {
    return await this.channelAnalyticsContext.findOne({
      where: { channelId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getByChannelIdAndDateAsync(
    channelId: string,
    snapshotDate: Date,
  ): Promise<YoutubeChannelAnalytics | null> {
    return await this.channelAnalyticsContext.findOne({
      where: { channelId, snapshotDate },
    });
  }

  async getLatestByUserIdAsync(
    userId: string,
  ): Promise<YoutubeChannelAnalytics | null> {
    return await this.channelAnalyticsContext.findOne({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getTrendsAsync(
    channelId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<YoutubeChannelAnalytics[]> {
    return await this.channelAnalyticsContext.find({
      where: {
        channelId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getLatestSnapshotDateByChannelIdAsync(
    channelId: string,
  ): Promise<Date | null> {
    const result = await this.channelAnalyticsContext.findOne({
      where: { channelId },
      order: { snapshotDate: 'DESC' },
      select: ['snapshotDate'],
    });
    return result?.snapshotDate || null;
  }

  async getLatestSnapshotDateByUserIdAsync(
    userId: string,
  ): Promise<Date | null> {
    const result = await this.channelAnalyticsContext.findOne({
      where: { userId },
      order: { snapshotDate: 'DESC' },
      select: ['snapshotDate'],
    });
    return result?.snapshotDate || null;
  }

  async getAggregatedMetricsAsync(
    channelId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ChannelMetricsAggregate> {
    const raw = await this.channelAnalyticsContext
      .createQueryBuilder('ca')
      .select('COALESCE(SUM(ca.viewCount), 0)', 'viewCount')
      .addSelect(
        'COALESCE(SUM(ca.estimatedMinutesWatched), 0)',
        'estimatedMinutesWatched',
      )
      .addSelect(
        'COALESCE(AVG(ca.averageViewDurationSeconds), 0)',
        'averageViewDurationSeconds',
      )
      .addSelect('COALESCE(SUM(ca.subscribersGained), 0)', 'subscribersGained')
      .addSelect('COALESCE(SUM(ca.subscribersLost), 0)', 'subscribersLost')
      .addSelect('COALESCE(SUM(ca.likes), 0)', 'likes')
      .addSelect('COALESCE(SUM(ca.comments), 0)', 'comments')
      .addSelect('COALESCE(SUM(ca.shares), 0)', 'shares')
      .addSelect(
        'COALESCE(SUM(ca.estimatedRevenueUsd), 0)',
        'estimatedRevenueUsd',
      )
      .addSelect(
        'COALESCE(SUM(ca.estimatedAdRevenueUsd), 0)',
        'estimatedAdRevenueUsd',
      )
      .addSelect('COUNT(ca.id)', 'snapshotCount')
      .where('ca.channelId = :channelId', { channelId })
      .andWhere('ca.snapshotDate >= :startDate', { startDate })
      .andWhere('ca.snapshotDate <= :endDate', { endDate })
      .getRawOne();

    return {
      viewCount: Number(raw?.viewCount) || 0,
      estimatedMinutesWatched: Number(raw?.estimatedMinutesWatched) || 0,
      averageViewDurationSeconds: Number(raw?.averageViewDurationSeconds) || 0,
      subscribersGained: Number(raw?.subscribersGained) || 0,
      subscribersLost: Number(raw?.subscribersLost) || 0,
      likes: Number(raw?.likes) || 0,
      comments: Number(raw?.comments) || 0,
      shares: Number(raw?.shares) || 0,
      estimatedRevenueUsd: Number(raw?.estimatedRevenueUsd) || 0,
      estimatedAdRevenueUsd: Number(raw?.estimatedAdRevenueUsd) || 0,
      snapshotCount: Number(raw?.snapshotCount) || 0,
    };
  }
}
