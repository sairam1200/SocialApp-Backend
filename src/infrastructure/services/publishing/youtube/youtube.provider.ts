import { Injectable, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { IPublishingProvider } from '../../../../domain/services/publishing/ipublishing.provider';
import {
  PublishContent,
  PublishResult,
  ValidationResult,
  PlatformCapabilities,
  ProgressCallback,
} from '../../../../domain/services/publishing/publishing.models';
import { PublishJob } from '../../../../domain/entities/publishJob.entity';
import { YoutubePublishingService } from '../../youtube/youtube-publishing.service';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { VideoCodecService } from '../../../../shared/video/video-codec.service';
import { VideoTranscodingService } from '../../../../shared/video/video-transcoding.service';
import { R2StorageService } from '../../../../shared/storage/r2/r2-storage.service';
import {
  PublishAuthError,
  PublishValidationError,
  PublishInfrastructureError,
} from '../../../../core/exceptions/publishing.exception';

@Injectable()
export class YoutubeProvider implements IPublishingProvider {
  readonly platform = _const.PLATFORMS.YOUTUBE;

  constructor(
    @Inject(_const.IYOUTUBE_PUBLISHING_SERVICE)
    private readonly publishingService: YoutubePublishingService,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
    private readonly videoCodecService: VideoCodecService,
    private readonly videoTranscodingService: VideoTranscodingService,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {}

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!content.title || content.title.trim().length === 0) {
      errors.push('Title is required');
    }
    if (content.title && content.title.length > 100) {
      errors.push('Title must be 100 characters or less');
    }
    if (!content.r2Key) {
      errors.push('R2 key is required');
    }

    return { valid: errors.length === 0, errors };
  }

  async publish(
    job: PublishJob,
    content: PublishContent,
    onProgress: ProgressCallback,
  ): Promise<PublishResult> {
    const linkedAccount = await this.linkedAccountRepo.getByIdAsync(
      job.linkedAccountId,
    );
    if (!linkedAccount) {
      throw new PublishAuthError('YouTube integration not found');
    }

    const account = await this.accountRepo.getByUserIdAsync(
      linkedAccount.userId,
    );
    if (!account) {
      throw new PublishAuthError('YouTube account not found');
    }
    if (!account.connected || !account.refreshToken) {
      throw new PublishAuthError('YouTube account is disconnected');
    }

    const isShort = content.metadata?.postType === 'short';

    if (
      isShort &&
      (!this.videoCodecService.isAvailable ||
        !this.videoTranscodingService.isAvailable)
    ) {
      throw new PublishInfrastructureError(
        'FFmpeg is required for YouTube Shorts processing but is not available on this server',
      );
    }

    let uploadStream: Readable | null = null;
    let uploadSize: number | undefined;
    let tmpDir: string | null = null;

    try {
      if (isShort) {
        tmpDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), `gaddr-short-${job.id}-`),
        );
        const originalPath = path.join(tmpDir, 'original.mp4');
        const processedPath = path.join(tmpDir, 'processed.mp4');

        const { stream: r2Stream } = await this.r2Storage.getStream(
          content.r2Key,
        );
        await pipeline(r2Stream, fs.createWriteStream(originalPath));

        onProgress?.(15, 'Analyzing video...');
        const metadata = await this.videoCodecService.detect(originalPath);
        if (!metadata) {
          throw new Error('Failed to detect video metadata');
        }

        if (this.videoCodecService.isShortsCompatible(metadata)) {
          logger.info(
            `[YoutubeProvider] Video already Shorts-compatible, uploading original: jobId=${job.id}`,
          );
          onProgress?.(20, 'Video is Shorts-compatible, uploading...');
          uploadStream = fs.createReadStream(originalPath);
          uploadSize = (await fs.promises.stat(originalPath)).size;
        } else {
          logger.info(
            `[YoutubeProvider] Transcoding to Shorts letterbox: jobId=${job.id} ` +
              `rotation=${metadata.rotation} duration=${metadata.duration.toFixed(1)}s`,
          );
          onProgress?.(20, 'Converting to Shorts format...');
          await this.videoTranscodingService.transcodeToShortsLetterbox(
            originalPath,
            processedPath,
            (pct) => onProgress?.(20 + Math.round(pct * 0.6), 'Converting...'),
          );
          onProgress?.(80, 'Uploading converted video...');
          uploadStream = fs.createReadStream(processedPath);
          uploadSize = (await fs.promises.stat(processedPath)).size;
        }
      } else {
        const { stream } = await this.r2Storage.getStream(content.r2Key);
        uploadStream = stream;
        uploadSize = content.fileSize;
      }

      const youtubeVideo = {
        id: job.id,
        title: content.title,
        description: content.description || '',
        tags: content.tags || [],
        visibility: content.visibility || 'public',
        publishAt: content.publishAt,
        status: 'uploading',
      };

      const result = await this.publishingService.uploadVideo(
        account,
        youtubeVideo as any,
        uploadStream,
        uploadSize,
        onProgress,
      );

      return {
        platformContentId: result.youtubeVideoId,
        platformContentUrl: result.youtubeUrl,
      };
    } finally {
      if (uploadStream && !uploadStream.destroyed) {
        uploadStream.destroy();
      }
      if (tmpDir) {
        await fs.promises
          .rm(tmpDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }
  }

  supportsMedia(contentType: string, mediaType: string): boolean {
    return mediaType === 'video';
  }

  normalizeError(error: unknown): {
    code: string;
    message: string;
    retryable: boolean;
  } {
    if (error instanceof PublishAuthError) {
      return { code: 'AUTH_ERROR', message: error.message, retryable: false };
    }
    if (error instanceof PublishValidationError) {
      return {
        code: 'VALIDATION_ERROR',
        message: error.message,
        retryable: false,
      };
    }
    if (error instanceof PublishInfrastructureError) {
      return {
        code: 'INFRASTRUCTURE_ERROR',
        message: error.message,
        retryable: false,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    const retryable = !message.includes('quota');
    return { code: 'UPLOAD_ERROR', message, retryable };
  }

  getCapabilities(): PlatformCapabilities {
    return {
      supportedMediaTypes: ['video/mp4', 'video/quicktime'],
      maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
      maxDurationSec: 43200,
      maxTitleLength: 100,
      maxDescriptionLength: 5000,
      supportsScheduledPublish: true,
      supportsTags: true,
    };
  }
}
