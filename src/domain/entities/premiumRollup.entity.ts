import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'premiumRollups', schema: 'analytics' })
export class PremiumRollup extends BaseEntity {
  @Column()
  userId: string;

  @Column({ type: 'timestamp' })
  weekStartDate: Date;

  @Column({ default: 0 })
  totalInteractions: number;

  @Column({ nullable: true })
  topFeatureUsed: string;

  @Column('jsonb', { default: {} })
  interactionBreakdown: Record<string, any>;

  constructor(request: Partial<PremiumRollup> = {}) {
    super();
    Object.assign(this, request);
  }
}
