import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PublishJob } from '../../domain/entities/publishJob.entity';
import { IPublishJobRepository } from '../../domain/repositories/ipublishJob.repository';

@Injectable()
export class PublishJobRepository implements IPublishJobRepository {
  constructor(
    @InjectRepository(PublishJob)
    private readonly repo: Repository<PublishJob>,
  ) {}

  async createAsync(job: PublishJob): Promise<PublishJob> {
    return this.repo.save(job);
  }

  async updateAsync(job: PublishJob): Promise<void> {
    await this.repo.save(job);
  }

  async getByIdAsync(id: string): Promise<PublishJob | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getByUserIdAsync(userId: string): Promise<PublishJob[]> {
    return this.repo.find({
      where: { userId },
      order: { createdOn: 'DESC' },
    });
  }

  async getByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
  ): Promise<PublishJob[]> {
    return this.repo.find({
      where: { userId, platform },
      order: { createdOn: 'DESC' },
    });
  }

  async getExpiredJobsAsync(): Promise<PublishJob[]> {
    return this.repo.find({
      where: {
        expiresAt: LessThan(new Date()),
        r2CleanedAt: undefined,
      },
      order: { expiresAt: 'ASC' },
    });
  }

  async getPendingRetriesAsync(): Promise<PublishJob[]> {
    return this.repo.find({
      where: {
        status: 'failed',
        nextRetryAt: LessThan(new Date()),
      },
      order: { nextRetryAt: 'ASC' },
    });
  }
}
