import { Repository, LessThan } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UploadJob } from "../../domain/entities";
import { IUploadJobRepository } from "../../domain/repositories/iuploadJob.repository";

@Injectable()
export class UploadJobRepository implements IUploadJobRepository {
  constructor(
    @InjectRepository(UploadJob)
    private readonly repo: Repository<UploadJob>,
  ) {}

  async createAsync(job: UploadJob): Promise<UploadJob> {
    return this.repo.save(job);
  }

  async updateAsync(job: UploadJob): Promise<void> {
    await this.repo.save(job);
  }

  async getByIdAsync(id: string): Promise<UploadJob | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getByVideoIdAsync(videoId: string): Promise<UploadJob | null> {
    return this.repo.findOne({ where: { videoId }, order: { createdOn: 'DESC' } });
  }

  async getPendingRetriesAsync(): Promise<UploadJob[]> {
    return this.repo.find({
      where: { status: 'failed', nextRetryAt: LessThan(new Date()) },
      order: { nextRetryAt: 'ASC' },
    });
  }
}
