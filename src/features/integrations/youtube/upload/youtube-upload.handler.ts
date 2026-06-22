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
    videoUrl: string;
    thumbnailUrl?: string;
    title: string;
    description?: string;
    tags?: string[];
    visibility?: 'public' | 'private' | 'unlisted';
    publishAt?: string;
  };

  constructor(request: Partial<YoutubeUploadCommand> = {}) {
    Object.assign(this, request);
  }
}

const uploadValidationSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  videoUrl: Joi.string().uri().required(),
  thumbnailUrl: Joi.string().uri().optional(),
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(5000).optional().allow(''),
  tags: Joi.array().items(Joi.string().max(100)).max(500).optional(),
  visibility: Joi.string().valid('public', 'private', 'unlisted').optional().default('public'),
  publishAt: Joi.date().iso().greater('now').optional(),
});

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
    youtubeUrl?: string;
    publishAt?: string;
    status: string;
  }> {
    const { model } = command;
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
      videoUrl: model.videoUrl,
      thumbnailUrl: model.thumbnailUrl,
      publishAt,
      status: publishAt ? 'scheduled' : 'pending',
    });

    const savedVideo = await this.videoRepo.createAsync(video);

    const uploadJob = new UploadJob({
      videoId: savedVideo.id,
      status: 'pending',
      attempts: 0,
    });
    await this.uploadJobRepo.createAsync(uploadJob);

    await this.uploadQueue.add('youtube-upload-job',
      {
        videoId: savedVideo.id,
        accountId: account.id,
        videoUrl: model.videoUrl,
        thumbnailUrl: model.thumbnailUrl,
      },
      {
        jobId: `youtube-upload-${savedVideo.id}`,
        attempts: 10,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    logger.info(`[YoutubeUpload] Upload job queued for video ${savedVideo.id}`);

    if (publishAt) {
      return {
        videoId: savedVideo.id,
        publishAt: publishAt.toISOString(),
        status: 'scheduled',
      };
    }

    return {
      videoId: savedVideo.id,
      status: 'queued',
    };
  }
}
