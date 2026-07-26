import { ExternalJob, Project } from '../entities';

/**
 * Read access to **Gaddr Jobs**, our sister product.
 *
 * An interface rather than a direct dependency because the two products share
 * a database *today* and may not tomorrow. This is the seam: swap the
 * implementation for HTTP calls and nothing above it changes.
 *
 * Read-only by design. Gaddr Jobs owns those tables and their migrations.
 */
export interface IGaddrJobsRepository {
  searchProjectsAsync(keyword: string, limit: number): Promise<Project[]>;
  searchExternalJobsAsync(
    keyword: string,
    limit: number,
  ): Promise<ExternalJob[]>;
  recentProjectsAsync(limit: number): Promise<Project[]>;
}
