import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * A job listing aggregated by **Gaddr Jobs**, our sister product.
 *
 * Read-only here, and mapped to Gaddr Jobs' own table in the shared database —
 * the same arrangement `Project` already uses. There is **no migration for
 * this entity on purpose**: Gaddr Jobs owns the schema, Drizzle owns the
 * migrations, and a second tool writing DDL for the same table is how two
 * products end up with a column each thinks it defined.
 *
 * Columns mirror `external-job-schema.ts` in that repository, including its
 * oddities: `salary_min`/`salary_max` are text in the database despite being
 * numbers conceptually, and there is no `updated_at`. Both are noted in their
 * schema as deliberate matches to reality; matching them here keeps the read
 * from failing on a type it did not expect.
 */
@Entity({ name: 'external_job', schema: 'public' })
export class ExternalJob {
  @PrimaryColumn({ type: 'int' })
  id: number;

  /** The board it was scraped from. */
  @Column({ type: 'text' })
  source: string;

  @Column({ name: 'source_id', type: 'text' })
  sourceId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  company: string;

  @Column({ type: 'text' })
  location: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  salary: string | null;

  @Column({ name: 'job_type', type: 'text', nullable: true })
  jobType: string | null;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @Column({ name: 'salary_min', type: 'text', nullable: true })
  salaryMin: string | null;

  @Column({ name: 'salary_max', type: 'text', nullable: true })
  salaryMax: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency: string | null;

  @Column({ name: 'quality_score', type: 'int', nullable: true })
  qualityScore: number | null;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
