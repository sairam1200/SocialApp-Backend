import { PublishJob } from '../entities/publishJob.entity';

export interface IPublishJobRepository {
  createAsync(job: PublishJob): Promise<PublishJob>;
  updateAsync(job: PublishJob): Promise<void>;
  getByIdAsync(id: string): Promise<PublishJob | null>;
  getByUserIdAsync(userId: string): Promise<PublishJob[]>;
  getByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
  ): Promise<PublishJob[]>;
  getExpiredJobsAsync(): Promise<PublishJob[]>;
  getPendingRetriesAsync(): Promise<PublishJob[]>;
}
