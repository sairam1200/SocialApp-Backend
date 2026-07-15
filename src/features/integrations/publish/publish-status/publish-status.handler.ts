import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { IPublishJobRepository } from '../../../../domain/repositories/ipublishJob.repository';
import { PublishValidationError } from '../../../../core/exceptions/publishing.exception';
import { PublishStatusQuery } from './publish-status.command';

@QueryHandler(PublishStatusQuery)
export class PublishStatusQueryHandler
  implements IQueryHandler<PublishStatusQuery>
{
  constructor(
    @Inject(_const.IPUBLISHJOB_REPOSITORY)
    private readonly publishJobRepo: IPublishJobRepository,
  ) {}

  public async execute(query: PublishStatusQuery): Promise<{
    id: string;
    platform: string;
    status: string;
    progress: number;
    statusMessage?: string;
    platformContentId?: string;
    platformContentUrl?: string;
    attempts: number;
    lastError?: string;
    nextRetryAt?: string;
    createdAt: string;
  }> {
    const job = await this.publishJobRepo.getByIdAsync(query.publishJobId);
    if (!job || job.userId !== query.userId) {
      throw new PublishValidationError('Publish job not found');
    }

    return {
      id: job.id,
      platform: job.platform,
      status: job.status,
      progress: job.progress,
      statusMessage: job.statusMessage,
      platformContentId: job.platformContentId,
      platformContentUrl: job.platformContentUrl,
      attempts: job.attempts,
      lastError: job.lastError,
      nextRetryAt: job.nextRetryAt?.toISOString(),
      createdAt: job.createdOn?.toISOString(),
    };
  }
}
