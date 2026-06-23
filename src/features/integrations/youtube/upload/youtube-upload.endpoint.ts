import { CommandBus } from '@nestjs/cqrs';
import { ApiProperty, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Post, UseGuards, Body, BadRequestException, Headers } from '@nestjs/common';
import { YoutubeUploadCommand } from './youtube-upload.handler';

class UploadRequestDto {
  @ApiProperty({ description: 'YouTube account ID (UUID)' })
  accountId: string;

  @ApiProperty({ description: 'Public HTTPS URL of the video file (MP4, MOV, AVI, etc.)' })
  videoUrl: string;

  @ApiProperty({ required: false, description: 'Public HTTPS URL of the thumbnail image (JPEG, PNG, WebP)' })
  thumbnailUrl?: string;

  @ApiProperty({ description: 'Video title (max 100 characters)' })
  title: string;

  @ApiProperty({ required: false, description: 'Video description (max 5000 characters)' })
  description?: string;

  @ApiProperty({ required: false, isArray: true, type: String, description: 'Video tags (max 500)' })
  tags?: string[];

  @ApiProperty({ required: false, enum: ['public', 'private', 'unlisted'], default: 'public' })
  visibility?: 'public' | 'private' | 'unlisted';

  @ApiProperty({ required: false, description: 'ISO 8601 scheduled publish datetime (must be in the future)' })
  publishAt?: string;
}

class UploadResponseDto {
  @ApiProperty({ description: 'Internal video record ID' })
  videoId: string;

  @ApiProperty({ required: false, description: 'YouTube watch URL (available after processing completes)' })
  youtubeUrl?: string;

  @ApiProperty({ required: false, description: 'Scheduled publish datetime' })
  publishAt?: string;

  @ApiProperty({ description: 'Upload status: queued | scheduled' })
  status: string;
}

const requestExample = {
  summary: 'YouTube Upload Request',
  value: {
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    videoUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
    thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/thumb.jpg',
    title: 'My Video Title',
    description: 'Optional video description',
    tags: ['tag1', 'tag2'],
    visibility: 'public',
    publishAt: '2026-07-01T12:00:00.000Z',
  },
};

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeUploadController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('upload')
  @UseGuards(UserAccoutGuard)
  @ApiConsumes('application/json')
  @ApiBody({ type: UploadRequestDto, examples: { request: requestExample } })
  @ApiResponse({ status: 200, description: 'Upload job queued', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST — Invalid payload or URL' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — Account disconnected' })
  public async Upload(
    @Headers('content-type') contentType: string,
    @Body() body: UploadRequestDto,
  ): Promise<UploadResponseDto> {
    if (!contentType || !contentType.includes('application/json')) {
      throw new BadRequestException('Content-Type must be application/json');
    }

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new BadRequestException('Request body is empty or malformed');
    }

    console.log('[YoutubeUploadController] REQUEST BODY:', JSON.stringify(body, null, 2));

    return this.commandBus.execute(
      new YoutubeUploadCommand({ model: body }),
    );
  }
}
