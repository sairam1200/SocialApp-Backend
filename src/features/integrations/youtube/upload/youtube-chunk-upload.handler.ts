import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { R2StorageService } from '../../../../shared/storage/r2/r2-storage.service';
import { YoutubeVideo } from '../../../../domain/entities/youtubeVideo.entity';
import { UploadJob } from '../../../../domain/entities/uploadJob.entity';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';

const CHUNK_TEMP_DIR = path.join(os.tmpdir(), 'chunk-uploads');

interface ChunkMetadata {
  accountId: string;
  title: string;
  description?: string;
  tags?: string[];
  visibility?: string;
  publishAt?: string;
  totalSize: number;
  fileName: string;
  userId: string;
  totalChunks: number;
  receivedChunks: number;
}

export class InitChunkUploadCommand {
  constructor(public readonly model: {
    accountId: string;
    title: string;
    description?: string;
    tags?: string[];
    visibility?: string;
    publishAt?: string;
    totalSize: number;
    fileName: string;
    totalChunks: number;
  }) {}
}

export class AppendChunkCommand {
  constructor(
    public readonly uploadId: string,
    public readonly chunkBuffer: Buffer,
    public readonly chunkIndex: number,
    public readonly totalChunks: number,
  ) {}
}

export class CompleteChunkUploadCommand {
  constructor(public readonly uploadId: string) {}
}

export class AbortChunkUploadCommand {
  constructor(public readonly uploadId: string) {}
}

interface ChunkProgressResponse {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  progress: number;
  complete: boolean;
}

interface ChunkCompleteResponse {
  videoId: string;
  jobId: string;
  status: string;
  publishAt?: string;
}

@CommandHandler(InitChunkUploadCommand)
export class InitChunkUploadCommandHandler implements ICommandHandler<InitChunkUploadCommand> {
  async execute(command: InitChunkUploadCommand): Promise<{ uploadId: string }> {
    const uploadId = crypto.randomUUID();
    const sessionDir = path.join(CHUNK_TEMP_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const metadata: ChunkMetadata = {
      ...command.model,
      userId,
      receivedChunks: 0,
    };
    fs.writeFileSync(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata));

    logger.info(`[ChunkUpload] Init: ${uploadId} totalChunks=${command.model.totalChunks} totalSize=${command.model.totalSize} fileName=${command.model.fileName}`);
    return { uploadId };
  }
}

@CommandHandler(AppendChunkCommand)
export class AppendChunkCommandHandler implements ICommandHandler<AppendChunkCommand> {
  async execute(command: AppendChunkCommand): Promise<ChunkProgressResponse> {
    const { uploadId, chunkBuffer, chunkIndex, totalChunks } = command;
    const sessionDir = path.join(CHUNK_TEMP_DIR, uploadId);

    if (!fs.existsSync(sessionDir)) {
      throw new YoutubeValidationError(`Upload session ${uploadId} not found`);
    }

    const videoPath = path.join(sessionDir, 'video.bin');
    fs.appendFileSync(videoPath, chunkBuffer);

    const metadataPath = path.join(sessionDir, 'metadata.json');
    const metadata: ChunkMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    metadata.receivedChunks = Math.max(metadata.receivedChunks, chunkIndex + 1);
    metadata.totalChunks = totalChunks;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));

    const progress = Math.round((metadata.receivedChunks / totalChunks) * 100);

    logger.info(`[ChunkUpload] Chunk ${chunkIndex + 1}/${totalChunks} for ${uploadId} — progress: ${progress}%`);

    return {
      uploadId,
      chunkIndex,
      totalChunks,
      progress,
      complete: metadata.receivedChunks >= totalChunks,
    };
  }
}

@CommandHandler(CompleteChunkUploadCommand)
export class CompleteChunkUploadCommandHandler implements ICommandHandler<CompleteChunkUploadCommand> {
  constructor(
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @InjectQueue(_const.BULL_QUEUES.YOUTUBE_UPLOAD)
    private readonly uploadQueue: Queue,
  ) {}

  async execute(command: CompleteChunkUploadCommand): Promise<ChunkCompleteResponse> {
    const { uploadId } = command;
    const sessionDir = path.join(CHUNK_TEMP_DIR, uploadId);

    if (!fs.existsSync(sessionDir)) {
      throw new YoutubeValidationError(`Upload session ${uploadId} not found`);
    }

    const metadata: ChunkMetadata = JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf-8'));

    if (!metadata.userId) {
      throw new YoutubeValidationError('Upload owner missing from metadata');
    }

    const videoPath = path.join(sessionDir, 'video.bin');

    if (!fs.existsSync(videoPath)) {
      throw new YoutubeValidationError('No video data received for upload session');
    }

    const stat = fs.statSync(videoPath);
    if (stat.size === 0) {
      throw new YoutubeValidationError('Video file is empty');
    }

    const r2Key = `videos/${metadata.accountId}/${crypto.randomUUID()}-${metadata.fileName || 'video.mp4'}`;

    try {
      const fileStream = fs.createReadStream(videoPath);
      await this.r2Storage.uploadStream(r2Key, fileStream, 'video/mp4');
      logger.info(`[ChunkUpload] Streamed to R2: ${r2Key} (${stat.size} bytes)`);

      const linkedAccount = await this.linkedAccountRepo.getByIdAsync(metadata.accountId);
      if (!linkedAccount) {
        throw new YoutubeValidationError('Linked account not found');
      }

      if (linkedAccount.userId !== metadata.userId) {
        logger.error(`[ChunkUpload] Ownership mismatch: account userId=${linkedAccount.userId} metadata userId=${metadata.userId}`);
        throw new YoutubeValidationError('Upload owner mismatch');
      }

      const publishAt = metadata.publishAt ? new Date(metadata.publishAt) : undefined;

      const video = new YoutubeVideo({
        accountId: linkedAccount.id,
        title: metadata.title,
        description: metadata.description || '',
        tags: metadata.tags || [],
        visibility: metadata.visibility || 'public',
        r2Key,
        publishAt,
        status: publishAt ? 'scheduled' : 'pending',
      });

      const savedVideo = await this.videoRepo.createAsync(video);

      const uploadJob = new UploadJob({
        videoId: savedVideo.id,
        status: 'pending',
        attempts: 0,
        r2Key,
        fileSize: stat.size,
      });
      await this.uploadJobRepo.createAsync(uploadJob);

      try {
        await this.uploadQueue.add('youtube-upload-job',
          {
            videoId: savedVideo.id,
            accountId: linkedAccount.id,
            r2Key,
          },
          {
            jobId: `youtube-upload-${savedVideo.id}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 60000 },
          },
        );
      } catch (queueError: unknown) {
        const message = queueError instanceof Error ? queueError.message : 'Unknown queue error';
        logger.error(`[ChunkUpload] Failed to enqueue job: ${message}`);
        savedVideo.status = 'failed';
        await this.videoRepo.updateAsync(savedVideo);
        uploadJob.status = 'failed';
        uploadJob.lastError = `Failed to enqueue: ${message}`;
        await this.uploadJobRepo.updateAsync(uploadJob);
        throw new YoutubeValidationError(`Upload queuing failed: ${message}`);
      }

      logger.info(`[ChunkUpload] Completed: video=${savedVideo.id} r2Key=${r2Key}`);

      return {
        videoId: savedVideo.id,
        jobId: uploadJob.id,
        status: publishAt ? 'scheduled' : 'queued',
        publishAt: publishAt?.toISOString(),
      };
    } catch (err: unknown) {
      this.r2Storage.deleteFile(r2Key).catch(() => {});
      throw err;
    } finally {
      this.cleanupSession(sessionDir);
    }
  }

  private cleanupSession(sessionDir: string): void {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info(`[ChunkUpload] Cleaned up session: ${path.basename(sessionDir)}`);
    } catch (err) {
      logger.warn(`[ChunkUpload] Cleanup failed for session ${path.basename(sessionDir)}:`, err);
    }
  }
}

@CommandHandler(AbortChunkUploadCommand)
export class AbortChunkUploadCommandHandler implements ICommandHandler<AbortChunkUploadCommand> {
  async execute(command: AbortChunkUploadCommand): Promise<void> {
    const sessionDir = path.join(CHUNK_TEMP_DIR, command.uploadId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info(`[ChunkUpload] Aborted session: ${command.uploadId}`);
    }
  }
}
