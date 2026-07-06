import { CommandBus } from '@nestjs/cqrs';
import {
  ApiProperty,
  ApiConsumes,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  Controller,
  Post,
  UseGuards,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { YoutubeUploadCommand } from './youtube-upload.handler';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import _const from '../../../../core/utils/const';
import { R2StorageService } from '../../../../shared/storage/r2/r2-storage.service';
import logger from '../../../../core/utils/winston.util';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';
import { validateVideoFile } from '../../../../shared/validators/video-format.validator';

class UploadFormFields {
  accountId: string;
  title: string;
  description?: string;
  tags?: string | string[];
  visibility?: 'public' | 'private' | 'unlisted';
  publishAt?: string;
}

class UploadResponseDto {
  @ApiProperty({ description: 'Internal video record ID' })
  videoId: string;

  @ApiProperty({ description: 'Upload job ID for progress tracking' })
  jobId: string;

  @ApiProperty({
    required: false,
    description: 'YouTube watch URL (available after processing completes)',
  })
  youtubeUrl?: string;

  @ApiProperty({ required: false, description: 'Scheduled publish datetime' })
  publishAt?: string;

  @ApiProperty({ description: 'Upload status: queued | scheduled' })
  status: string;
}

const TEMP_DIR = path.join(os.tmpdir(), 'youtube-uploads');

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeUploadController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {}

  @Post('upload')
  @UseGuards(UserAccoutGuard)
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
          }
          cb(null, TEMP_DIR);
        },
        filename: (_req, file, cb) => {
          cb(null, `${crypto.randomUUID()}-${file.originalname || 'video'}`);
        },
      }),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Upload job queued',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Upload(
    @UploadedFile() video: Express.Multer.File,
    @Body() fields: UploadFormFields,
  ): Promise<UploadResponseDto> {
    if (!video) {
      throw new BadRequestException('Video file is required');
    }

    const validation = validateVideoFile(video.path, video.originalname);
    if (!validation.valid) {
      try {
        if (fs.existsSync(video.path)) fs.unlinkSync(video.path);
      } catch {}
      throw new BadRequestException(validation.error!);
    }

    const contentType = validation.mimeType || video.mimetype || 'video/mp4';
    const r2Key = `videos/${fields.accountId}/${crypto.randomUUID()}${path.extname(video.originalname || '.mp4')}`;

    try {
      const fileStream = fs.createReadStream(video.path);
      await this.r2Storage.uploadStream(r2Key, fileStream, contentType);

      logger.info(
        `[YoutubeUpload] Video streamed to R2: ${r2Key} (${video.size} bytes)`,
      );

      return this.commandBus.execute(
        new YoutubeUploadCommand({
          model: {
            accountId: fields.accountId,
            r2Key,
            title: fields.title,
            description: fields.description,
            tags: fields.tags
              ? typeof fields.tags === 'string'
                ? fields.tags.split(',').map((t: string) => t.trim())
                : fields.tags
              : [],
            visibility: fields.visibility || 'public',
            publishAt: fields.publishAt || undefined,
            fileSize: video.size,
          },
        }),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown upload error';
      this.r2Storage.deleteFile(r2Key).catch(() => {});
      throw new YoutubeValidationError(`Upload failed: ${message}`);
    } finally {
      try {
        if (fs.existsSync(video.path)) fs.unlinkSync(video.path);
      } catch {}
    }
  }
}
