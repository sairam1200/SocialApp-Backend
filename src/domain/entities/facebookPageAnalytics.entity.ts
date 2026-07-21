import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'facebookPageAnalytics', schema: 'analytics' })
@Index(['pageId', 'snapshotDate'], { unique: true })
@Index(['pageId'])
@Index(['snapshotDate'])
@Index(['engagement'])
@Index(['impressions'])
@Index(['reach'])
export class FacebookPageAnalytics extends BaseEntity {
  @Column({ nullable: false })
  pageId: string;

  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'integer', default: 0 })
  followerCount: number;

  @Column({ type: 'integer', default: 0 })
  fanCount: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'bigint', default: 0 })
  reach: number;

  @Column({ type: 'double precision', default: 0 })
  engagement: number;

  @Column({ type: 'integer', default: 0 })
  pageViews: number;

  @Column({ type: 'integer', default: 0 })
  clicks: number;

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<FacebookPageAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
