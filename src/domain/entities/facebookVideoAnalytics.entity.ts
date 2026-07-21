import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'facebookVideoAnalytics', schema: 'analytics' })
@Index(['videoId', 'snapshotDate'], { unique: true })
@Index(['videoId'])
@Index(['snapshotDate'])
export class FacebookVideoAnalytics extends BaseEntity {
  @Column({ nullable: false })
  videoId: string;

  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'bigint', default: 0 })
  videoViews: number;

  @Column({ type: 'integer', default: 0 })
  uniqueViewers: number;

  @Column({ type: 'integer', default: 0 })
  threeSecondViews: number;

  @Column({ type: 'integer', default: 0 })
  oneMinuteViews: number;

  @Column({ type: 'double precision', default: 0 })
  averageWatchTime: number;

  @Column({ type: 'bigint', default: 0 })
  totalWatchTime: number;

  @Column({ type: 'double precision', default: 0 })
  completionRate: number;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ nullable: true })
  duration?: string;

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<FacebookVideoAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
