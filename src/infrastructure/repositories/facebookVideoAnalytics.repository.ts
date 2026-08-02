import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FacebookVideoAnalytics } from '../../domain/entities/facebookVideoAnalytics.entity';
import { IFacebookVideoAnalyticsRepository } from '../../domain/repositories/ifacebookVideoAnalytics.repository';

@Injectable()
export class FacebookVideoAnalyticsRepository implements IFacebookVideoAnalyticsRepository {
  constructor(
    @InjectRepository(FacebookVideoAnalytics)
    private readonly videoAnalyticsContext: Repository<FacebookVideoAnalytics>,
  ) {}

  async createOrUpdateAsync(
    analytics: FacebookVideoAnalytics,
  ): Promise<FacebookVideoAnalytics> {
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

  async getLatestByVideoIdAsync(
    videoId: string,
  ): Promise<FacebookVideoAnalytics | null> {
    return await this.videoAnalyticsContext.findOne({
      where: { videoId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByVideoIdAndUserIdAsync(
    videoId: string,
    userId: string,
  ): Promise<FacebookVideoAnalytics | null> {
    return await this.videoAnalyticsContext.findOne({
      where: { videoId, userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAsync(
    userId: string,
  ): Promise<FacebookVideoAnalytics[]> {
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

  async getTrendsAsync(
    videoId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FacebookVideoAnalytics[]> {
    return await this.videoAnalyticsContext.find({
      where: {
        videoId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getTopVideosAsync(
    userId: string,
    limit: number,
  ): Promise<FacebookVideoAnalytics[]> {
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
      .orderBy('va.videoViews', 'DESC')
      .limit(limit)
      .getMany();
  }
}
