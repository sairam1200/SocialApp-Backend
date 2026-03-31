import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../../domain/entities/analyticsEvent.entity';
import { IAnalyticsRepository } from '../../domain/repositories/ianalytics.repository';

@Injectable()
export class AnalyticsRepository implements IAnalyticsRepository {

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsContext: Repository<AnalyticsEvent>,
  ) { }

  async trackEventAsync(
    eventName: string,
    userId?: string,
    metadata: Record<string, any> = {},
  ): Promise<AnalyticsEvent> {
    const event = this.analyticsContext.create({ eventName, userId, metadata });
    return this.analyticsContext.save(event);
  }

  async getEventsByUserAsync(userId: string, fromDate: Date): Promise<AnalyticsEvent[]> {
    return this.analyticsContext
      .createQueryBuilder('ae')
      .where('ae.userId = :userId', { userId })
      .andWhere('ae.createdAt >= :fromDate', { fromDate })
      .getMany();
  }

  async getAllEventsAsync(fromDate: Date): Promise<AnalyticsEvent[]> {
    return this.analyticsContext
      .createQueryBuilder('ae')
      .where('ae.createdAt >= :fromDate', { fromDate })
      .getMany();
  }
}
