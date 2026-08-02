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

<<<<<<< HEAD
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

=======
  /**
   * Denormalised search text: title plus the platform's body text.
   *
   * Exists so search does not have to expand every row's `metaData` with
   * `json_each_text` on every query — that was a full table scan with per-row JSON
   * parsing. Backed by a `pg_trgm` GIN index, so `ILIKE '%term%'` is index-assisted.
   *
   * Populated by `buildSearchText()` below; the constructor derives it automatically,
   * so callers that build a ContentStream normally get it for free.
   */
  @Column({ type: 'text', nullable: true })
  searchText?: string;

>>>>>>> other/staging
  constructor(request: Partial<ContentStream> = {}) {
    super();
    Object.assign(this, request);

    // Derive on construction unless explicitly supplied, so every write path stays
    // searchable without each one remembering to set it.
    if (this.searchText === undefined) {
      this.searchText = ContentStream.buildSearchText(
        this.title,
        this.metaData,
      );
    }
  }

  /**
   * Title plus whichever key this platform uses for body text.
   *
   * YouTube says `description`, Facebook `message`, Instagram `caption`, Reddit
   * `selftext`. Kept in sync with the same fallback chain in
   * `database-search.handler.ts`.
   */
  static buildSearchText(
    title?: string | null,
    metaData?: Record<string, any> | null,
  ): string {
    const body =
      metaData?.description ??
      metaData?.message ??
      metaData?.caption ??
      metaData?.selftext ??
      '';

    return `${title ?? ''} ${typeof body === 'string' ? body : ''}`
      .replace(/\s+/g, ' ')
      .trim();
  }
}
