import { BaseEntity } from '../baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'youtube_analytics' })
@Index(['videoId', 'snapshotDate'], { unique: true })
export class YoutubeAnalytic extends BaseEntity {
  @Column()
  @Index()
  videoId: string;

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  likes: number;

  @Column({ default: 0 })
  comments: number;

  @Column({ default: 0 })
  watchTime: number;

  @Column()
  snapshotDate: Date;

  constructor(request: Partial<YoutubeAnalytic> = {}) {
    super();
    Object.assign(this, request);
  }
}
