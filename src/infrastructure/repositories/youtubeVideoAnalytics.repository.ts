import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { YoutubeVideoAnalytics } from '../../domain/entities/youtubeVideoAnalytics.entity';
import { IYoutubeVideoAnalyticsRepository } from '../../domain/repositories/iyoutubeVideoAnalytics.repository';

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
}
