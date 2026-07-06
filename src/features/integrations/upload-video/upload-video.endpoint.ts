import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiConsumes, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../core/passport';
import { CommandBus } from '@nestjs/cqrs';
import { UploadVideoCommand } from './upload-video.handler';
import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'video-uploads');

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations`,
  version: '1',
})
export class UploadVideoController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('upload/video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: TEMP_DIR,
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.mp4';
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 256 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'video/mp4',
          'video/quicktime',
          'video/x-msvideo',
          'video/x-matroska',
          'video/x-ms-wmv',
          'video/mpeg',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported video type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Video file to upload (MP4, MOV, AVI, MKV, WMV, MPEG)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OK — Returns the video URL and metadata',
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string; transcoded: boolean }> {
    return this.commandBus.execute(new UploadVideoCommand({ file }));
  }
}
