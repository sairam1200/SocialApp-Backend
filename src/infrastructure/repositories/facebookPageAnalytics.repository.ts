import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FacebookPageAnalytics } from '../../domain/entities/facebookPageAnalytics.entity';
import { IFacebookPageAnalyticsRepository } from '../../domain/repositories/ifacebookPageAnalytics.repository';

@Injectable()
export class FacebookPageAnalyticsRepository implements IFacebookPageAnalyticsRepository {
  constructor(
    @InjectRepository(FacebookPageAnalytics)
    private readonly pageAnalyticsContext: Repository<FacebookPageAnalytics>,
  ) {}

  async createOrUpdateAsync(analytics: FacebookPageAnalytics): Promise<FacebookPageAnalytics> {
    const existing = await this.pageAnalyticsContext.findOne({
      where: {
        pageId: analytics.pageId,
        snapshotDate: analytics.snapshotDate,
      },
    });

    if (existing) {
      Object.assign(existing, analytics);
      return await this.pageAnalyticsContext.save(existing);
    }

    const newEntity = this.pageAnalyticsContext.create(analytics);
    return await this.pageAnalyticsContext.save(newEntity);
  }

  async getLatestByPageIdAsync(pageId: string): Promise<FacebookPageAnalytics | null> {
    return await this.pageAnalyticsContext.findOne({
      where: { pageId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getLatestByUserIdAsync(userId: string): Promise<FacebookPageAnalytics | null> {
    return await this.pageAnalyticsContext.findOne({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getTrendsAsync(pageId: string, startDate: Date, endDate: Date): Promise<FacebookPageAnalytics[]> {
    return await this.pageAnalyticsContext.find({
      where: {
        pageId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });
  }
}
