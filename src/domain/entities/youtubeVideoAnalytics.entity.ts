import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'youtubeVideoAnalytics', schema: 'analytics' })
@Index(['videoId', 'snapshotDate'], { unique: true })
@Index(['userId', 'snapshotDate'])
export class YoutubeVideoAnalytics extends BaseEntity {
  @Column({ nullable: false })
  videoId: string;

  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'bigint', default: 0 })
  viewCount: number;

  @Column({ type: 'integer', default: 0 })
  likeCount: number;

  @Column({ type: 'integer', default: 0 })
  commentCount: number;

  @Column({ type: 'integer', default: 0 })
  favoriteCount: number;

  @Column({ type: 'bigint', default: 0 })
  estimatedMinutesWatched: number;

  @Column({ type: 'double precision', default: 0 })
  averageViewDurationSeconds: number;

  @Column({ type: 'integer', default: 0 })
  shares: number;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ nullable: true })
  duration?: string;

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<YoutubeVideoAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
