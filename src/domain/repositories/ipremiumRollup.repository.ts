import { PremiumRollup } from '../entities/premiumRollup.entity';

export interface IPremiumRollupRepository {
  upsertRollupAsync(rollup: Partial<PremiumRollup>): Promise<PremiumRollup>;
  getRollupsByUserAsync(userId: string): Promise<PremiumRollup[]>;
}
