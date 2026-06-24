import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'youtubeChannelAnalytics', schema: 'analytics' })
@Index(['channelId', 'snapshotDate'], { unique: true })
export class YoutubeChannelAnalytics extends BaseEntity {

  @Column({ nullable: false })
  channelId: string;

  @Column({ nullable: false })
  userId: string;

  @Column({ type: 'integer', default: 0 })
  subscriberCount: number;

  @Column({ type: 'bigint', default: 0 })
  viewCount: number;

  @Column({ type: 'integer', default: 0 })
  videoCount: number;

  @Column('jsonb', { default: {} })
  engagementMetrics: Record<string, any>;

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<YoutubeChannelAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
