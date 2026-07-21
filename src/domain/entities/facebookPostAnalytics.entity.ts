import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'facebookPostAnalytics', schema: 'analytics' })
@Index(['postId', 'snapshotDate'], { unique: true })
@Index(['postId'])
@Index(['snapshotDate'])
@Index(['engagement'])
@Index(['impressions'])
@Index(['reach'])
export class FacebookPostAnalytics extends BaseEntity {
  @Column({ nullable: false })
  postId: string;

  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'bigint', default: 0 })
  reach: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  engagement: number;

  @Column({ type: 'integer', default: 0 })
  reactionsCount: number;

  @Column({ type: 'integer', default: 0 })
  likeCount: number;

  @Column({ type: 'integer', default: 0 })
  loveCount: number;

  @Column({ type: 'integer', default: 0 })
  hahaCount: number;

  @Column({ type: 'integer', default: 0 })
  wowCount: number;

  @Column({ type: 'integer', default: 0 })
  sadCount: number;

  @Column({ type: 'integer', default: 0 })
  angryCount: number;

  @Column({ type: 'integer', default: 0 })
  commentCount: number;

  @Column({ type: 'integer', default: 0 })
  shareCount: number;

  @Column({ type: 'integer', default: 0 })
  clickCount: number;

  @Column({ type: 'integer', default: 0 })
  videoViews: number;

  @Column({ type: 'double precision', default: 0 })
  averageWatchTime: number;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ nullable: true })
  postType?: string;

  @Column({ type: 'date', nullable: false })
  snapshotDate: Date;

  constructor(request: Partial<FacebookPostAnalytics> = {}) {
    super();
    Object.assign(this, request);
  }
}
