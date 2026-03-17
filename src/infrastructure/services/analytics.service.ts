import { Injectable, Inject } from '@nestjs/common';
import _const from '../../core/utils/const';
import { IAnalyticsRepository } from '../../domain/repositories/ianalytics.repository';
import { IAnalyticsService } from '../../domain/services/ianalytics.service';

@Injectable()
export class AnalyticsService implements IAnalyticsService {

  constructor(
    @Inject(_const.IANALYTICS_REPOSITORY)
    private readonly analyticsRepository: IAnalyticsRepository,
  ) { }

  async trackEvent(
    eventName: string,
    userId?: string,
    properties: Record<string, any> = {},
  ): Promise<void> {
    await this.analyticsRepository.trackEventAsync(eventName, userId, properties);
  }
}
