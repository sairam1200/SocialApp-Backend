import {
  Controller,
  Get,
  Param,
  Inject,
  NotFoundException,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../../domain/repositories/iuploadJob.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

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
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
  ) {}

  @Get('upload/status/:videoId')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'Video upload status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async getStatus(
    @Param('videoId') videoId: string,
  ): Promise<VideoStatusResponse> {
    const userId = HttpContext.getCurrentUserId;

    const video = await this.videoRepo.getByIdAsync(videoId);
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const linkedAccount = await this.linkedAccountRepo.getByIdAsync(
      video.accountId,
    );
    if (!linkedAccount) {
      throw new NotFoundException('Linked account not found for video');
    }

    if (linkedAccount.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
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
