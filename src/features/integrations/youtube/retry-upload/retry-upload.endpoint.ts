import { Controller, Post, Param, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeRetryUploadController {
  constructor(
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
    @InjectQueue(_const.BULL_QUEUES.YOUTUBE_UPLOAD)
    private readonly uploadQueue: Queue,
  ) {}

  @Post('upload/retry/:videoId')
  @ApiResponse({ status: 200, description: 'Upload retry queued' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  @ApiResponse({ status: 400, description: 'Video not in failed state or already uploaded' })
  async retryUpload(@Param('videoId') videoId: string): Promise<{ jobId: string; status: string }> {
    const video = await this.videoRepo.getByIdAsync(videoId);
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.youtubeVideoId) {
      throw new BadRequestException('Video has already been uploaded to YouTube');
    }

    if (video.status !== 'failed') {
      throw new BadRequestException('Video is not in failed state');
    }

    if (!video.r2Key) {
      throw new BadRequestException('Video has no associated R2 file');
    }

    // Resolve channelId from the linked account (needed by processor)
    const linkedAccount = await this.linkedAccountRepo.getByIdAsync(video.accountId);
    if (!linkedAccount) {
      throw new NotFoundException('Linked account not found for video');
    }

    video.status = 'pending';
    await this.videoRepo.updateAsync(video);

    const uploadJob = await this.uploadJobRepo.getByVideoIdAsync(videoId);
    if (uploadJob) {
      uploadJob.status = 'pending';
      uploadJob.progress = 0;
      uploadJob.statusMessage = 'Retrying...';
      uploadJob.lastError = undefined;
      uploadJob.nextRetryAt = undefined;
      await this.uploadJobRepo.updateAsync(uploadJob);
    }

    const job = await this.uploadQueue.add('youtube-upload-job',
      {
        videoId: video.id,
        accountId: video.accountId,
        r2Key: video.r2Key,
      },
      {
        jobId: `youtube-upload-${video.id}-retry-${Date.now()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60000 },
      },
    );

    logger.info(`[YoutubeRetryUpload] Retry job queued for video ${videoId}, jobId: ${job.id}`);

    return { jobId: job.id!, status: 'queued' };
  }
}
