import { BaseEntity } from '../baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'upload_jobs' })
export class UploadJob extends BaseEntity {
  @Column({ nullable: true })
  @Index()
  videoId?: string;

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
  r2Key?: string;

  @Column({ nullable: true, type: 'bigint' })
  fileSize?: number;

  constructor(request: Partial<UploadJob> = {}) {
    super();
    Object.assign(this, request);
  }
}
