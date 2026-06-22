import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { YoutubeAnalyticsService } from '../../../../infrastructure/services/youtube/youtube-analytics.service';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';

export class YoutubeStatsQuery {
  model: {
    accountId: string;
    videoId?: string;
    startDate?: Date;
    endDate?: Date;
  };

  constructor(request: Partial<YoutubeStatsQuery> = {}) {
    Object.assign(this, request);
  }
}

const statsValidationSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  videoId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

@CommandHandler(YoutubeStatsQuery)
export class YoutubeStatsQueryHandler implements ICommandHandler<YoutubeStatsQuery> {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBE_ANALYTICS_SERVICE)
    private readonly analyticsService: YoutubeAnalyticsService,
  ) {}

  public async execute(query: YoutubeStatsQuery): Promise<{
    views: number;
    likes: number;
    comments: number;
    watchTime: number;
  }> {
    const { model } = query;
    await statsValidationSchema.validateAsync(model).catch((err) => {
      throw new YoutubeValidationError(err.message);
    });

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const account = await this.accountRepo.getByIdAsync(model.accountId);
    if (!account || account.userId !== userId) {
      throw new YoutubeValidationError('YouTube account not found or does not belong to user');
    }

    return this.analyticsService.getAggregatedAnalytics(
      account,
      model.videoId,
      model.startDate,
      model.endDate,
    );
  }
}
