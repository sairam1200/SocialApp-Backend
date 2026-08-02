import { PremiumRollup } from '../entities/premiumRollup.entity';

export interface IPremiumRollupRepository {
  upsertRollupAsync(rollup: Partial<PremiumRollup>): Promise<PremiumRollup>;
  batchUpsertRollupsAsync(rollups: Partial<PremiumRollup>[]): Promise<void>;
  getRollupsByUserAsync(userId: string): Promise<PremiumRollup[]>;
}
