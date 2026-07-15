import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { PublishJob } from '../../../../domain/entities/publishJob.entity';
import { IPublishJobRepository } from '../../../../domain/repositories/ipublishJob.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';
import { PublishValidationError } from '../../../../core/exceptions/publishing.exception';
import { PublishProviderRegistry } from '../../../../infrastructure/services/publishing/publish-provider.registry';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PublishContentCommand } from './publish-content.command';

const publishValidationSchema = Joi.object({
  linkedAccountId: Joi.string().uuid().required(),
  platform: Joi.string()
    .valid('youtube', 'facebook', 'instagram', 'linkedin', 'pinterest')
    .required(),
  uploadId: Joi.string().uuid().required().messages({
    'string.empty': 'uploadId is required',
  }),
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(5000).optional().allow(''),
  tags: Joi.array().items(Joi.string().max(100)).max(500).optional(),
  visibility: Joi.string()
    .valid('public', 'private', 'unlisted')
    .optional()
    .default('public'),
  publishAt: Joi.date().iso().greater('now').optional(),
}).required();

@CommandHandler(PublishContentCommand)
export class PublishContentCommandHandler
  implements ICommandHandler<PublishContentCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
    @Inject(_const.IPUBLISHJOB_REPOSITORY)
    private readonly publishJobRepo: IPublishJobRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @Inject(_const.IPUBLISH_PROVIDER_REGISTRY)
    private readonly providerRegistry: PublishProviderRegistry,
    @InjectQueue(_const.BULL_QUEUES.PUBLISH_CONTENT)
    private readonly publishQueue: Queue,
  ) {}

  public async execute(command: PublishContentCommand): Promise<{
    publishJobId: string;
    platform: string;
    status: string;
  }> {
    const model = {
      linkedAccountId: command.linkedAccountId,
      platform: command.platform,
      uploadId: command.uploadId,
      title: command.title,
      description: command.description,
      tags: command.tags,
      visibility: command.visibility,
      publishAt: command.publishAt,
    };

    await publishValidationSchema.validateAsync(model).catch((err) => {
      throw new PublishValidationError(err.message);
    });

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (!this.providerRegistry.hasProvider(model.platform)) {
      throw new PublishValidationError(
        `Platform not supported for publishing: ${model.platform}`,
      );
    }

    const linkedAccount = await this.linkedAccountRepo.getByIdAsync(
      model.linkedAccountId,
    );
    if (
      !linkedAccount ||
      linkedAccount.platform !== model.platform ||
      linkedAccount.userId !== userId
    ) {
      throw new PublishValidationError(
        'Account not found or does not belong to user',
      );
    }

    const uploadJob = await this.uploadJobRepo.getByIdAsync(model.uploadId);
    if (!uploadJob) {
      throw new PublishValidationError(
        `Upload job not found: ${model.uploadId}`,
      );
    }

    const r2Key = uploadJob.r2Key;
    if (!r2Key) {
      throw new PublishValidationError(
        `Upload job ${model.uploadId} has no R2 key — upload may not be complete`,
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const publishJob = new PublishJob({
      userId,
      linkedAccountId: model.linkedAccountId,
      platform: model.platform,
      uploadId: model.uploadId,
      r2Key,
      fileSize: uploadJob.fileSize,
      status: 'pending',
      expiresAt,
      metadata: {
        title: model.title,
        description: model.description,
        tags: model.tags,
        visibility: model.visibility,
        publishAt: model.publishAt,
        postType: command.metadata?.postType,
      },
    });

    const savedJob = await this.publishJobRepo.createAsync(publishJob);

    try {
      await this.publishQueue.add(
        'publish-content-job',
        {
          publishJobId: savedJob.id,
        },
        {
          jobId: `publish-${savedJob.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    } catch (queueError: unknown) {
      const message =
        queueError instanceof Error
          ? queueError.message
          : 'Unknown queue error';
      logger.error(
        `[PublishContent] Failed to enqueue job ${savedJob.id}: ${message}`,
      );
      savedJob.status = 'failed';
      savedJob.lastError = `Failed to enqueue: ${message}`;
      await this.publishJobRepo.updateAsync(savedJob);
      throw new PublishValidationError(`Publish queuing failed: ${message}`);
    }

    logger.info(
      `[PublishContent] Job queued: id=${savedJob.id} platform=${model.platform} uploadId=${model.uploadId}`,
    );

    return {
      publishJobId: savedJob.id,
      platform: model.platform,
      status: 'queued',
    };
  }
}
