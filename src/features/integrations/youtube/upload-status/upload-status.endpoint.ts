import { Controller, Get, Param, Inject, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';

class VideoStatusResponse {
  id: string;
  status: string;
  progress: number;
  statusMessage?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  uploadError?: string;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeUploadStatusController {
  constructor(
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
  ) {}

  @Get('upload/status/:videoId')
  @ApiResponse({ status: 200, description: 'Video upload status' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async getStatus(@Param('videoId') videoId: string): Promise<VideoStatusResponse> {
    const video = await this.videoRepo.getByIdAsync(videoId);
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const uploadJob = await this.uploadJobRepo.getByVideoIdAsync(videoId);

    return {
      id: video.id,
      status: video.status,
      progress: uploadJob?.progress ?? 0,
      statusMessage: uploadJob?.statusMessage,
      youtubeVideoId: video.youtubeVideoId,
      youtubeUrl: video.youtubeUrl,
      uploadError: uploadJob?.lastError,
    };
  }
}
