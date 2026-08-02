import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../../domain/entities/analyticsEvent.entity';
import {
  AggregatedEventRow,
  IAnalyticsRepository,
} from '../../domain/repositories/ianalytics.repository';

@Injectable()
export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsContext: Repository<AnalyticsEvent>,
  ) {}

  async trackEventAsync(
    eventName: string,
    userId?: string,
    metadata: Record<string, any> = {},
  ): Promise<AnalyticsEvent> {
    const event = this.analyticsContext.create({ eventName, userId, metadata });
    return this.analyticsContext.save(event);
  }

  async getEventsByUserAsync(
    userId: string,
    fromDate: Date,
  ): Promise<AnalyticsEvent[]> {
    return this.analyticsContext
      .createQueryBuilder('ae')
      .where('ae.userId = :userId', { userId })
      .andWhere('ae.createdOn >= :fromDate', { fromDate })
      .getMany();
  }

  async getAllEventsAsync(fromDate: Date): Promise<AnalyticsEvent[]> {
    return this.analyticsContext
      .createQueryBuilder('ae')
      .where('ae.createdOn >= :fromDate', { fromDate })
      .getMany();
  }

  /**
   * Returns pre-aggregated event counts via SQL GROUP BY (userId, eventName).
   * Result is one row per user per event type instead of one row per event.
   */
  async getAggregatedEventsAsync(
    since: Date,
  ): Promise<AggregatedEventRow[]> {
    const rows = await this.analyticsContext
      .createQueryBuilder('event')
      .select('event.userId', 'userId')
      .addSelect('event.eventName', 'eventName')
      .addSelect('COUNT(*)', 'count')
      .where('event.createdOn >= :since', { since })
      .groupBy('event.userId')
      .addGroupBy('event.eventName')
      .getRawMany();

    return rows.map((r) => ({
      userId: r.userId ?? 'anonymous',
      eventName: r.eventName,
      count: parseInt(r.count, 10),
    }));
  }
}
