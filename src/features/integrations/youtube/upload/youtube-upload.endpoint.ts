import { CommandBus } from '@nestjs/cqrs';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Post, HttpStatus, Res, Req, UseGuards, Body } from '@nestjs/common';
import { YoutubeUploadCommand } from './youtube-upload.handler';

class UploadRequestDto {
  @ApiProperty()
  accountId: string;

  @ApiProperty()
  videoUrl: string;

  @ApiProperty({ required: false })
  thumbnailUrl?: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false, isArray: true, type: String })
  tags?: string[];

  @ApiProperty({ required: false, enum: ['public', 'private', 'unlisted'] })
  visibility?: 'public' | 'private' | 'unlisted';

  @ApiProperty({ required: false })
  publishAt?: string;
}

class UploadResponseDto {
  @ApiProperty()
  videoId: string;

  @ApiProperty({required: false})
  youtubeUrl?: string;

  @ApiProperty({ required: false })
  publishAt?: string;

  @ApiProperty()
  status: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeUploadController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('upload')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: UploadResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Upload(
  @Body() body: UploadRequestDto,
): Promise<UploadResponseDto> {                     // ← removed @Res()
  return this.commandBus.execute(                    // ← no manual res.json()
    new YoutubeUploadCommand({ model: body })
  );
}
}
