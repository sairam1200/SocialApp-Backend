import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import { MediaKind } from '../../enums';
import { Post } from './post.entity';

/** One image, video, audio clip or document attached to a post. */
@Entity({ name: 'post_media', schema: 'social' })
export class PostMedia extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_post_media_post')
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post?: Post;

  @Column({ type: 'enum', enum: MediaKind, default: MediaKind.Image })
  kind: MediaKind;

  @Column({ type: 'varchar', length: 1024 })
  url: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ type: 'integer', nullable: true })
  width?: number;

  @Column({ type: 'integer', nullable: true })
  height?: number;

  /** Seconds. Set for video and audio. */
  @Column({ type: 'double precision', nullable: true })
  duration?: number;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mimeType?: string;

  /** Alt text. Required by the composer for images — accessibility is not optional. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  altText?: string;

  /** Dominant colour, used as the placeholder while the asset loads. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  placeholderColor?: string;

  constructor(request: Partial<PostMedia> = {}) {
    super();
    Object.assign(this, request);
  }
}
