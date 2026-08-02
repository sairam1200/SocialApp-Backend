import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FacebookPostAnalytics } from '../../domain/entities/facebookPostAnalytics.entity';
import { IFacebookPostAnalyticsRepository } from '../../domain/repositories/ifacebookPostAnalytics.repository';

@Injectable()
export class FacebookPostAnalyticsRepository implements IFacebookPostAnalyticsRepository {
  constructor(
    @InjectRepository(FacebookPostAnalytics)
    private readonly postAnalyticsContext: Repository<FacebookPostAnalytics>,
  ) {}

  async createOrUpdateAsync(
    analytics: FacebookPostAnalytics,
  ): Promise<FacebookPostAnalytics> {
    const existing = await this.postAnalyticsContext.findOne({
      where: {
        postId: analytics.postId,
        snapshotDate: analytics.snapshotDate,
      },
    });

    if (existing) {
      Object.assign(existing, analytics);
      return await this.postAnalyticsContext.save(existing);
    }

    const newEntity = this.postAnalyticsContext.create(analytics);
    return await this.postAnalyticsContext.save(newEntity);
  }

  async getLatestByPostIdAsync(
    postId: string,
  ): Promise<FacebookPostAnalytics | null> {
    return await this.postAnalyticsContext.findOne({
      where: { postId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByPostIdAndUserIdAsync(
    postId: string,
    userId: string,
  ): Promise<FacebookPostAnalytics | null> {
    return await this.postAnalyticsContext.findOne({
      where: { postId, userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAsync(
    userId: string,
  ): Promise<FacebookPostAnalytics[]> {
    const subQuery = this.postAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.postId'])
      .where('sub.userId = :userId', { userId })
      .orderBy('sub.postId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.postAnalyticsContext
      .createQueryBuilder('pa')
      .where(`pa.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('pa.snapshotDate', 'DESC')
      .getMany();
  }

  async getTrendsAsync(
    postId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FacebookPostAnalytics[]> {
    return await this.postAnalyticsContext.find({
      where: {
        postId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getTopPostsAsync(
    userId: string,
    limit: number,
  ): Promise<FacebookPostAnalytics[]> {
    const subQuery = this.postAnalyticsContext
      .createQueryBuilder('sub')
      .select('sub.id')
      .distinctOn(['sub.postId'])
      .where('sub.userId = :userId', { userId })
      .orderBy('sub.postId', 'ASC')
      .addOrderBy('sub.snapshotDate', 'DESC');

    return await this.postAnalyticsContext
      .createQueryBuilder('pa')
      .where(`pa.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('pa.reach', 'DESC') // Order by reach (or engagement depending on parameter)
      .limit(limit)
      .getMany();
  }
}
