import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'analyticsEvents', schema: 'analytics' })
export class AnalyticsEvent extends BaseEntity {

  @Column()
  eventName: string;

  @Column({ nullable: true })
  userId: string;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;

  constructor(request: Partial<AnalyticsEvent> = {}) {
    super();
    Object.assign(this, request);
  }
}
