import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { YoutubeVideo } from '../../../../domain/entities/youtubeVideo.entity';
import { UploadJob } from '../../../../domain/entities/uploadJob.entity';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export class YoutubeUploadCommand {
  model: {
    accountId: string;
    r2Key: string;
    title: string;
    description?: string;
    tags?: string[];
    visibility?: 'public' | 'private' | 'unlisted';
    publishAt?: string;
    fileSize?: number;
  };

  constructor(request: Partial<YoutubeUploadCommand> = {}) {
    Object.assign(this, request);
  }
}

const uploadValidationSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  r2Key: Joi.string().required().messages({
    'string.empty': 'r2Key is required',
  }),
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(5000).optional().allow(''),
  tags: Joi.array().items(Joi.string().max(100)).max(500).optional(),
  visibility: Joi.string().valid('public', 'private', 'unlisted').optional().default('public'),
  publishAt: Joi.date().iso().greater('now').optional(),
  fileSize: Joi.number().positive().optional(),
}).required();

@CommandHandler(YoutubeUploadCommand)
export class YoutubeUploadCommandHandler implements ICommandHandler<YoutubeUploadCommand> {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @InjectQueue(_const.BULL_QUEUES.YOUTUBE_UPLOAD)
    private readonly uploadQueue: Queue,
  ) {}

  public async execute(command: YoutubeUploadCommand): Promise<{
    videoId: string;
    jobId: string;
    youtubeUrl?: string;
    publishAt?: string;
    status: string;
  }> {
    const { model } = command;

    if (!model) {
      throw new YoutubeValidationError('Invalid request body');
    }
    await uploadValidationSchema.validateAsync(model).catch((err) => {
      throw new YoutubeValidationError(err.message);
    });

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const account = await this.accountRepo.getByIdAsync(model.accountId);
    if (!account || account.userId !== userId) {
      throw new YoutubeValidationError('YouTube account not found or does not belong to user');
    }

    if (!account.connected) {
      throw new YoutubeValidationError('YouTube account is disconnected');
    }

    const publishAt = model.publishAt ? new Date(model.publishAt) : undefined;

    const video = new YoutubeVideo({
      accountId: account.id,
      title: model.title,
      description: model.description || '',
      tags: model.tags || [],
      visibility: model.visibility || 'public',
      r2Key: model.r2Key,
      publishAt,
      status: publishAt ? 'scheduled' : 'pending',
    });

    const savedVideo = await this.videoRepo.createAsync(video);

    const uploadJob = new UploadJob({
      videoId: savedVideo.id,
      status: 'pending',
      attempts: 0,
      r2Key: model.r2Key,
      fileSize: model.fileSize,
    });
    await this.uploadJobRepo.createAsync(uploadJob);

    await this.uploadQueue.add('youtube-upload-job',
      {
        videoId: savedVideo.id,
        accountId: account.id,
        r2Key: model.r2Key,
      },
      {
        jobId: `youtube-upload-${savedVideo.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    logger.info(`[YoutubeUpload] Upload job queued for video ${savedVideo.id}, r2Key: ${model.r2Key}`);

    if (publishAt) {
      return {
        videoId: savedVideo.id,
        jobId: uploadJob.id,
        publishAt: publishAt.toISOString(),
        status: 'scheduled',
      };
    }

    return {
      videoId: savedVideo.id,
      jobId: uploadJob.id,
      status: 'queued',
    };
  }
}
