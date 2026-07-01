import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'youtubeChannelAnalytics', schema: 'analytics' })
@Index(['channelId', 'snapshotDate'], { unique: true })
@Index(['userId', 'snapshotDate'])
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

  @Column({ type: 'bigint', default: 0 })
  estimatedMinutesWatched: number;

  @Column({ type: 'double precision', default: 0 })
  averageViewDurationSeconds: number;

  @Column({ type: 'integer', default: 0 })
  subscribersGained: number;

  @Column({ type: 'integer', default: 0 })
  subscribersLost: number;

  @Column({ type: 'integer', default: 0 })
  likes: number;

  @Column({ type: 'integer', default: 0 })
  comments: number;

  @Column({ type: 'integer', default: 0 })
  shares: number;

  @Column({ type: 'double precision', default: 0 })
  estimatedRevenueUsd: number;

  @Column({ type: 'double precision', default: 0 })
  estimatedAdRevenueUsd: number;

  @Column('jsonb', { default: [] })
  trafficSources: any[];

  @Column('jsonb', { default: [] })
  geography: any[];

  @Column('jsonb', { default: [] })
  devices: any[];

  @Column('jsonb', { default: {} })
  audience: Record<string, any>;

  @Column('jsonb', { default: [] })
  playbackLocations: any[];

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<YoutubeChannelAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
