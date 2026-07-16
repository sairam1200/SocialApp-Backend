import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import _const from '../../../core/utils/const';
import { IPremiumRollupRepository } from '../../../domain/repositories/ipremiumRollup.repository';
import { PremiumRollup } from '../../../domain/entities/premiumRollup.entity';

// ─── Query ───────────────────────────────────────────────────────────────────
export class GetWeeklyStatsQuery {
  userId: string;

  constructor(request: Partial<GetWeeklyStatsQuery> = {}) {
    Object.assign(this, request);
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
@QueryHandler(GetWeeklyStatsQuery)
export class GetWeeklyStatsQueryHandler
  implements IQueryHandler<GetWeeklyStatsQuery>
{
  constructor(
    @Inject(_const.IPREMIUMROLLUP_REPOSITORY)
    private readonly premiumRollupRepository: IPremiumRollupRepository,
  ) {}

  async execute(query: GetWeeklyStatsQuery): Promise<PremiumRollup[]> {
    return this.premiumRollupRepository.getRollupsByUserAsync(query.userId);
  }
}
