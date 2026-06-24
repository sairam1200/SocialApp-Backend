import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Post, Param, Body, UseGuards, BadRequestException, Headers, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InitChunkUploadCommand, AppendChunkCommand, CompleteChunkUploadCommand, AbortChunkUploadCommand } from './youtube-chunk-upload.handler';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';

class InitUploadDto {
  accountId: string;
  title: string;
  description?: string;
  tags?: string[];
  visibility?: string;
  publishAt?: string;
  totalSize: number;
  fileName: string;
  totalChunks: number;
}

class ChunkResponse {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  progress: number;
  complete: boolean;
  videoId?: string;
  jobId?: string;
  status?: string;
  publishAt?: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeChunkUploadController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('upload/init')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'Upload session initialized' })
  async initUpload(@Body() body: InitUploadDto): Promise<{ uploadId: string }> {
    if (!body.accountId || !body.title || !body.totalSize || !body.fileName || !body.totalChunks) {
      throw new BadRequestException('accountId, title, totalSize, fileName, and totalChunks are required');
    }
    if (body.totalChunks < 1) {
      throw new BadRequestException('totalChunks must be at least 1');
    }
    return this.commandBus.execute(new InitChunkUploadCommand(body));
  }

  @Post('upload/chunk/:uploadId')
  @UseGuards(UserAccoutGuard)
  @UseInterceptors(FileInterceptor('chunk', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Chunk received' })
  async uploadChunk(
    @Param('uploadId') uploadId: string,
    @UploadedFile() chunk: Express.Multer.File,
    @Headers('x-chunk-index') chunkIndex: string,
    @Headers('x-total-chunks') totalChunks: string,
  ): Promise<ChunkResponse> {
    if (!chunk) {
      throw new BadRequestException('Chunk file is required');
    }
    if (!uploadId) {
      throw new BadRequestException('uploadId is required');
    }

    const index = parseInt(chunkIndex, 10);
    const total = parseInt(totalChunks, 10);

    if (isNaN(index) || isNaN(total) || index < 0 || total < 1) {
      throw new BadRequestException('Invalid x-chunk-index or x-total-chunks headers');
    }

    const result = await this.commandBus.execute(
      new AppendChunkCommand(uploadId, chunk.buffer, index, total),
    );

    if (result.complete) {
      try {
        const completeResult = await this.commandBus.execute(new CompleteChunkUploadCommand(uploadId));
        return {
          ...result,
          videoId: completeResult.videoId,
          jobId: completeResult.jobId,
          status: completeResult.status,
          publishAt: completeResult.publishAt,
        };
      } catch (err) {
        this.commandBus.execute(new AbortChunkUploadCommand(uploadId)).catch(() => {});
        throw err;
      }
    }

    return result;
  }

  @Post('upload/complete/:uploadId')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'Upload finalized' })
  async completeUpload(
    @Param('uploadId') uploadId: string,
  ): Promise<ChunkResponse> {
    if (!uploadId) {
      throw new BadRequestException('uploadId is required');
    }

    const result = await this.commandBus.execute(new CompleteChunkUploadCommand(uploadId));

    return {
      uploadId,
      chunkIndex: 0,
      totalChunks: 0,
      progress: 100,
      complete: true,
      videoId: result.videoId,
      jobId: result.jobId,
      status: result.status,
      publishAt: result.publishAt,
    };
  }

  @Post('upload/abort/:uploadId')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'Upload aborted' })
  async abortUpload(@Param('uploadId') uploadId: string): Promise<{ success: boolean }> {
    await this.commandBus.execute(new AbortChunkUploadCommand(uploadId));
    return { success: true };
  }
}
