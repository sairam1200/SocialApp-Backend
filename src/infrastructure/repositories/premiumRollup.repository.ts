import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PremiumRollup } from '../../domain/entities/premiumRollup.entity';
import { IPremiumRollupRepository } from '../../domain/repositories/ipremiumRollup.repository';

@Injectable()
export class PremiumRollupRepository implements IPremiumRollupRepository {
  constructor(
    @InjectRepository(PremiumRollup)
    private readonly rollupContext: Repository<PremiumRollup>,
  ) {}

  async upsertRollupAsync(
    rollup: Partial<PremiumRollup>,
  ): Promise<PremiumRollup> {
    const existing = await this.rollupContext.findOne({
      where: { userId: rollup.userId, weekStartDate: rollup.weekStartDate },
    });

    if (existing) {
      Object.assign(existing, rollup);
      return this.rollupContext.save(existing);
    }

    const newRollup = this.rollupContext.create(rollup);
    return this.rollupContext.save(newRollup);
  }

  /**
   * Batch upsert: fetches all existing rollups for the given week in one
   * query, merges, and saves in a single TypeORM save() call instead of
   * N individual findOne + save round-trips.
   */
  async batchUpsertRollupsAsync(
    rollups: Partial<PremiumRollup>[],
  ): Promise<void> {
    if (rollups.length === 0) return;

    // All rollups in a single batch share the same weekStartDate
    const weekStartDate = rollups[0].weekStartDate;

    // Single query to fetch all existing rollups for this week
    const userIds = rollups.map((r) => r.userId).filter(Boolean);
    const existingRecords = await this.rollupContext.find({
      where: {
        userId: In(userIds),
        weekStartDate,
      },
    });

    const existingMap = new Map(
      existingRecords.map((r) => [r.userId, r]),
    );

    const toSave = rollups.map((rollup) => {
      const existing = existingMap.get(rollup.userId);
      if (existing) {
        Object.assign(existing, rollup);
        return existing;
      }
      return this.rollupContext.create(rollup);
    });

    // Single save call — TypeORM batches the INSERT/UPDATE internally
    await this.rollupContext.save(toSave);
  }

  async getRollupsByUserAsync(userId: string): Promise<PremiumRollup[]> {
    return this.rollupContext.find({
      where: { userId },
      order: { weekStartDate: 'DESC' },
    });
  }
}
