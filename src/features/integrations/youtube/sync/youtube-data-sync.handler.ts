import * as Joi from 'joi';
import axios from 'axios';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { cryptoUtils } from '../../../../core/utils/crypto.util';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { YoutubeAccount } from '../../../../domain/entities/youtubeAccount.entity';
import { YoutubeVideo } from '../../../../domain/entities/youtubeVideo.entity';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../../domain/repositories/iyoutubeVideo.repository';
import { YoutubeAnalyticsService } from '../../../../infrastructure/services/youtube/youtube-analytics.service';
import { YoutubeValidationError } from '../../../../core/exceptions/youtube-publishing.exception';

export class YoutubeDataSyncCommand {
  model: {
    accountId: string;
  };

  constructor(request: Partial<YoutubeDataSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

const syncValidationSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
});

@CommandHandler(YoutubeDataSyncCommand)
export class YoutubeDataSyncCommandHandler implements ICommandHandler<YoutubeDataSyncCommand> {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IYOUTUBE_ANALYTICS_SERVICE)
    private readonly analyticsService: YoutubeAnalyticsService,
  ) {}

  public async execute(command: YoutubeDataSyncCommand): Promise<{ syncedVideos: number }> {
    const { model } = command;
    await syncValidationSchema.validateAsync(model).catch((err) => {
      throw new YoutubeValidationError(err.message);
    });

    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const account = await this.accountRepo.getByIdAsync(model.accountId);
    if (!account || account.userId !== userId) {
      throw new YoutubeValidationError('YouTube account not found or does not belong to user');
    }

    const accessToken = await this.ensureAccessToken(account);

    let syncedVideos = 0;
    let nextPageToken: string | undefined;

    try {
      do {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: 'snippet,contentDetails,statistics',
            id: account.channelId,
          },
        });

        const channel = response.data.items?.[0];
        if (channel?.contentDetails?.relatedPlaylists?.uploads) {
          const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

          let pageToken: string | undefined;
          do {
            const playlistResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                part: 'snippet,contentDetails',
                playlistId: uploadsPlaylistId,
                maxResults: 50,
                pageToken,
              },
            });

            for (const item of playlistResponse.data.items || []) {
              const youtubeVideoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
              if (!youtubeVideoId) continue;

              let existingVideo = await this.videoRepo.getByYoutubeVideoIdAsync(youtubeVideoId);

              if (existingVideo) {
                existingVideo.title = item.snippet.title;
                existingVideo.description = item.snippet.description;
                existingVideo.thumbnailUrl = item.snippet.thumbnails?.default?.url;
                existingVideo.publishedAt = item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : existingVideo.publishedAt;
                existingVideo.status = 'published';
                existingVideo.youtubeUrl = `https://youtube.com/watch?v=${youtubeVideoId}`;
                await this.videoRepo.updateAsync(existingVideo);
              } else {
                const newVideo = new YoutubeVideo({
                  accountId: account.id,
                  youtubeVideoId,
                  title: item.snippet.title || 'Untitled',
                  description: item.snippet.description || '',
                  thumbnailUrl: item.snippet.thumbnails?.default?.url,
                  publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
                  visibility: 'public',
                  status: 'published',
                  youtubeUrl: `https://youtube.com/watch?v=${youtubeVideoId}`,
                });
                await this.videoRepo.createAsync(newVideo);
              }

              syncedVideos++;
            }

            pageToken = playlistResponse.data.nextPageToken;
          } while (pageToken);
        }

        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);

      const analyticsSynced = await this.analyticsService.syncVideoAnalytics(account);
      logger.info(`[YoutubeDataSync] Synced ${syncedVideos} videos and ${analyticsSynced} analytics for account ${account.id}`);

      return { syncedVideos };
    } catch (error: any) {
      logger.error('[YoutubeDataSync] Sync failed', error.response?.data || error.message);
      throw error;
    }
  }

  private async ensureAccessToken(account: YoutubeAccount): Promise<string> {
    const now = new Date();
    if (account.tokenExpiry > now) {
      return cryptoUtils.decrypt(account.accessToken);
    }

    const refreshToken = cryptoUtils.decrypt(account.refreshToken);
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: configs.youtube.clientId,
      client_secret: configs.youtube.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const { access_token, expires_in } = response.data;
    account.accessToken = cryptoUtils.encrypt(access_token);
    account.tokenExpiry = new Date(Date.now() + expires_in * 1000);
    await this.accountRepo.updateAsync(account);

    return access_token;
  }
}
