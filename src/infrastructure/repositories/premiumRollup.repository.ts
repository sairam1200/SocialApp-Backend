import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PremiumRollup } from '../../domain/entities/premiumRollup.entity';
import { IPremiumRollupRepository } from '../../domain/repositories/ipremiumRollup.repository';

@Injectable()
export class PremiumRollupRepository implements IPremiumRollupRepository {

  constructor(
    @InjectRepository(PremiumRollup)
    private readonly rollupContext: Repository<PremiumRollup>,
  ) { }

  async upsertRollupAsync(rollup: Partial<PremiumRollup>): Promise<PremiumRollup> {
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

  async getRollupsByUserAsync(userId: string): Promise<PremiumRollup[]> {
    return this.rollupContext.find({
      where: { userId },
      order: { weekStartDate: 'DESC' },
    });
  }
}
