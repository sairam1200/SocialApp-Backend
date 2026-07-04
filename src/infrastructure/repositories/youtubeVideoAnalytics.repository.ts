import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { YoutubeVideoAnalytics } from '../../domain/entities/youtubeVideoAnalytics.entity';
import { IYoutubeVideoAnalyticsRepository, VideoMetricsAggregate } from '../../domain/repositories/iyoutubeVideoAnalytics.repository';

@Injectable()
export class YoutubeVideoAnalyticsRepository implements IYoutubeVideoAnalyticsRepository {
  constructor(
    @InjectRepository(YoutubeVideoAnalytics)
    private readonly videoAnalyticsContext: Repository<YoutubeVideoAnalytics>,
  ) {}

  async createOrUpdateAsync(analytics: YoutubeVideoAnalytics): Promise<YoutubeVideoAnalytics> {
    const existing = await this.videoAnalyticsContext.findOne({
      where: {
        videoId: analytics.videoId,
        snapshotDate: analytics.snapshotDate,
      },
    });

    if (existing) {
      Object.assign(existing, analytics);
      return await this.videoAnalyticsContext.save(existing);
    }

    const newEntity = this.videoAnalyticsContext.create(analytics);
    return await this.videoAnalyticsContext.save(newEntity);
  }

  async getLatestByVideoIdAsync(videoId: string): Promise<YoutubeVideoAnalytics | null> {
    return await this.videoAnalyticsContext.findOne({
      where: { videoId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAndVideoIdAsync(userId: string, videoId: string): Promise<YoutubeVideoAnalytics | null> {
    return await this.videoAnalyticsContext.findOne({
      where: { userId, videoId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAsync(userId: string): Promise<YoutubeVideoAnalytics[]> {
    const subQuery = this.videoAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.videoId'])
      .where('sub.userId = :userId', { userId })
      .orderBy('sub.videoId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.videoAnalyticsContext
      .createQueryBuilder('va')
      .where(`va.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('va.snapshotDate', 'DESC')
      .getMany();
  }

  async getTrendsAsync(videoId: string, startDate: Date, endDate: Date): Promise<YoutubeVideoAnalytics[]> {
    return await this.videoAnalyticsContext.find({
      where: {
        videoId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getTrendsByUserIdAndVideoIdAsync(userId: string, videoId: string, startDate: Date, endDate: Date): Promise<YoutubeVideoAnalytics[]> {
    return await this.videoAnalyticsContext.find({
      where: {
        userId,
        videoId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getTopVideosAsync(userId: string, limit: number): Promise<YoutubeVideoAnalytics[]> {
    const subQuery = this.videoAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.videoId'])
      .where('sub.userId = :userId', { userId })
      .orderBy('sub.videoId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.videoAnalyticsContext
      .createQueryBuilder('va')
      .where(`va.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('va.viewCount', 'DESC')
      .limit(limit)
      .getMany();
  }

  async getTopVideosByVideoIdsAsync(userId: string, videoIds: string[], limit: number): Promise<YoutubeVideoAnalytics[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const subQuery = this.videoAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.videoId'])
      .where('sub.userId = :userId', { userId })
      .andWhere('sub.videoId IN (:...videoIds)', { videoIds })
      .orderBy('sub.videoId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.videoAnalyticsContext
      .createQueryBuilder('va')
      .where(`va.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('va.viewCount', 'DESC')
      .limit(limit)
      .getMany();
  }

  async getAggregatedVideoMetricsAsync(userId: string, startDate: Date, endDate: Date): Promise<VideoMetricsAggregate> {
    const raw = await this.videoAnalyticsContext
      .createQueryBuilder('va')
      .select('COALESCE(SUM(va.viewCount), 0)', 'viewCount')
      .addSelect('COALESCE(SUM(va.estimatedMinutesWatched), 0)', 'estimatedMinutesWatched')
      .addSelect('COALESCE(AVG(va.averageViewDurationSeconds), 0)', 'averageViewDurationSeconds')
      .addSelect('COALESCE(SUM(va.likeCount), 0)', 'likes')
      .addSelect('COALESCE(SUM(va.commentCount), 0)', 'comments')
      .addSelect('COALESCE(SUM(va.shares), 0)', 'shares')
      .addSelect('COUNT(DISTINCT va.videoId)', 'videoCount')
      .where('va.userId = :userId', { userId })
      .andWhere('va.snapshotDate >= :startDate', { startDate })
      .andWhere('va.snapshotDate <= :endDate', { endDate })
      .getRawOne();

    return {
      viewCount: Number(raw?.viewCount) || 0,
      estimatedMinutesWatched: Number(raw?.estimatedMinutesWatched) || 0,
      averageViewDurationSeconds: Number(raw?.averageViewDurationSeconds) || 0,
      likes: Number(raw?.likes) || 0,
      comments: Number(raw?.comments) || 0,
      shares: Number(raw?.shares) || 0,
      videoCount: Number(raw?.videoCount) || 0,
    };
  }

  async getTopVideosByVideoIdsSortedAsync(userId: string, videoIds: string[], limit: number): Promise<YoutubeVideoAnalytics[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const subQuery = this.videoAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.videoId'])
      .where('sub.userId = :userId', { userId })
      .andWhere('sub.videoId IN (:...videoIds)', { videoIds })
      .orderBy('sub.videoId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.videoAnalyticsContext
      .createQueryBuilder('va')
      .where(`va.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('va.likeCount', 'DESC')
      .addOrderBy('va.viewCount', 'DESC')
      .addOrderBy('va.estimatedMinutesWatched', 'DESC')
      .addOrderBy('va.publishedAt', 'DESC', 'NULLS LAST')
      .limit(limit)
      .getMany();
  }
}
