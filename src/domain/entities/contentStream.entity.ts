import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../baseEntity';
import { StreamEntityType } from '../enums';

@Entity({ name: 'contentStreams' })
export class ContentStream extends BaseEntity {
  @Column({ type: 'enum', enum: StreamEntityType })
  type: StreamEntityType;

  @Column({ nullable: false })
  subType: string;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: false })
  platform: string;

  @Column({ nullable: false })
  externalId: string;

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  // Search columns (Phase 1: Unified Search)
  @Column({ type: 'text', nullable: true })
  searchText?: string;

  @Column({ type: 'tsvector', nullable: true, select: false })
  searchVector?: string;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'double precision', nullable: true })
  engagementScore?: number;

  @Column({ type: 'uuid', nullable: true })
  creatorId?: string;

  constructor(request: Partial<ContentStream> = {}) {
    super();
    Object.assign(this, request);
  }
}
