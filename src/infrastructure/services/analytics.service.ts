import { Injectable, Inject } from '@nestjs/common';
import _const from '../../core/utils/const';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
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
    properties: Record<string, any> = {},
  ): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.analyticsRepository.trackEventAsync(eventName, userId, properties);
  }
}