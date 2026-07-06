import { BadRequestException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import _const from '../../../core/utils/const';
import configs from '../../../configs';
import { R2StorageService } from '../../../shared/storage/r2/r2-storage.service';
import { VideoCodecService } from '../../../shared/video/video-codec.service';
import { VideoTranscodingService } from '../../../shared/video/video-transcoding.service';

const TEMP_DIR = path.join(os.tmpdir(), 'video-uploads');
const ACCEPTED_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.wmv',
  '.mpeg',
  '.m4v',
  '.mpg',
];

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export class UploadVideoCommand {
  file?: Express.Multer.File;
  constructor(request: Partial<UploadVideoCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(UploadVideoCommand)
export class UploadVideoCommandHandler
  implements ICommandHandler<UploadVideoCommand>
{
  constructor(
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
    private readonly codecService: VideoCodecService,
    private readonly transcodingService: VideoTranscodingService,
  ) {}

  public async execute(
    command: UploadVideoCommand,
  ): Promise<{ url: string; transcoded: boolean }> {
    const file = command.file;
    if (!file || !file.path) {
      throw new BadRequestException('Video file is required');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      this.cleanup(file.path);
      throw new BadRequestException(
        `Unsupported video format: "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`,
      );
    }

    if (file.size === 0) {
      this.cleanup(file.path);
      throw new BadRequestException('Uploaded file is empty');
    }

    const r2Key = `uploads/${crypto.randomUUID()}.mp4`;
    let transcoded = false;

    try {
      const metadata = await this.codecService.detect(file.path);

      if (metadata && this.codecService.isBrowserCompatible(metadata)) {
        const stream = fs.createReadStream(file.path);
        await this.r2Storage.uploadStream(r2Key, stream, 'video/mp4');
      } else if (metadata && this.transcodingService.isAvailable) {
        const outputPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.mp4`);
        try {
          await this.transcodingService.transcodeToCompatible(
            file.path,
            outputPath,
          );
          const stream = fs.createReadStream(outputPath);
          await this.r2Storage.uploadStream(r2Key, stream, 'video/mp4');
          transcoded = true;
        } finally {
          this.cleanup(outputPath);
        }
      } else if (metadata && !this.transcodingService.isAvailable) {
        const stream = fs.createReadStream(file.path);
        await this.r2Storage.uploadStream(r2Key, stream, 'video/mp4');
      } else {
        const stream = fs.createReadStream(file.path);
        await this.r2Storage.uploadStream(r2Key, stream, 'video/mp4');
      }

      const publicUrl = `${configs.r2.publicUrlBase}/${configs.r2.bucket}/${r2Key}`;
      return { url: publicUrl, transcoded };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Video processing failed: ${(err as Error).message}`,
      );
    } finally {
      this.cleanup(file.path);
    }
  }

  private cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // temp file cleanup failure is non-fatal
    }
  }
}
