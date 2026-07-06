import { UploadJob } from '../entities';

export interface IUploadJobRepository {
  createAsync(job: UploadJob): Promise<UploadJob>;
  updateAsync(job: UploadJob): Promise<void>;
  getByIdAsync(id: string): Promise<UploadJob | null>;
  getByVideoIdAsync(videoId: string): Promise<UploadJob | null>;
  getPendingRetriesAsync(): Promise<UploadJob[]>;
  deleteByVideoIdsAsync(videoIds: string[]): Promise<void>;
}
