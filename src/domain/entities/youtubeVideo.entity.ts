import { BaseEntity } from "../baseEntity";
import { Column, Entity, Index } from "typeorm";

@Entity({ name: 'youtube_videos' })
export class YoutubeVideo extends BaseEntity {
  @Column()
  @Index()
  accountId: string;

  @Column({ nullable: true })
  youtubeVideoId?: string;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  visibility?: string;

  @Column({ nullable: true })
  publishAt?: Date;

  @Column({ nullable: true })
  publishedAt?: Date;

  @Column({ default: 'draft' })
  status: string;

  @Column({ nullable: true })
  thumbnailUrl?: string;

  @Column({ nullable: true })
  youtubeUrl?: string;

  @Column({ nullable: true })
  videoUrl?: string;

  @Column({ nullable: true })
  r2Key?: string;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  constructor(request: Partial<YoutubeVideo> = {}) {
    super();
    Object.assign(this, request);
  }
}
