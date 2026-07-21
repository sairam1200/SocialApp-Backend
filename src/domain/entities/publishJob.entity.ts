import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'publish_jobs' })
export class PublishJob extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid' })
  @Index()
  linkedAccountId: string;

  @Column()
  @Index()
  platform: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  uploadId?: string;

  @Column({ nullable: true })
  r2Key?: string;

  @Column({ nullable: true, type: 'bigint' })
  fileSize?: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ default: 0 })
  progress: number;

  @Column({ nullable: true, type: 'text' })
  statusMessage?: string;

  @Column({ nullable: true, type: 'text' })
  lastError?: string;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @Column({ nullable: true })
  platformContentId?: string;

  @Column({ nullable: true })
  platformContentUrl?: string;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true })
  r2CleanedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  constructor(partial?: Partial<PublishJob>) {
    super();
    Object.assign(this, partial);
  }
}
