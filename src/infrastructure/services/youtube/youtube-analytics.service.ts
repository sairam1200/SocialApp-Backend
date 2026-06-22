import axios from 'axios';
import { Injectable, Inject } from '@nestjs/common';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { cryptoUtils } from '../../../core/utils/crypto.util';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
import { YoutubeAccount } from '../../../domain/entities/youtubeAccount.entity';
import { YoutubeVideo } from '../../../domain/entities/youtubeVideo.entity';
import { YoutubeAnalytic } from '../../../domain/entities/youtubeAnalytic.entity';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../domain/repositories/iyoutubeVideo.repository';
import { IYoutubeAnalyticRepository } from '../../../domain/repositories/iyoutubeAnalytic.repository';
import { YoutubeAuthError, YoutubeAnalyticsError } from '../../../core/exceptions/youtube-publishing.exception';

@Injectable()
export class YoutubeAnalyticsService {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IYOUTUBEANALYTIC_REPOSITORY)
    private readonly analyticRepo: IYoutubeAnalyticRepository,
  ) {}

  async getAndStoreVideoAnalytics(account: YoutubeAccount, video: YoutubeVideo): Promise<YoutubeAnalytic> {
    const accessToken = await this.ensureAccessToken(account);

    if (!video.youtubeVideoId) {
      throw new YoutubeAnalyticsError('Video has no YouTube ID');
    }

    try {
      const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          part: 'statistics',
          id: video.youtubeVideoId,
        },
      });

      const stats = response.data.items?.[0]?.statistics;
      if (!stats) {
        throw new YoutubeAnalyticsError('No statistics found for video');
      }

      const analytic = new YoutubeAnalytic({
        videoId: video.id,
        views: parseInt(stats.viewCount || '0', 10),
        likes: parseInt(stats.likeCount || '0', 10),
        comments: parseInt(stats.commentCount || '0', 10),
        watchTime: 0,
        snapshotDate: new Date(),
      });

      return this.analyticRepo.createAsync(analytic);
    } catch (error: any) {
      logger.error('[YoutubeAnalytics] Failed to fetch video analytics', error.response?.data || error.message);
      throw new YoutubeAnalyticsError('Failed to fetch video analytics');
    }
  }

  async getAggregatedAnalytics(
    account: YoutubeAccount,
    videoId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ views: number; likes: number; comments: number; watchTime: number }> {
    const accessToken = await this.ensureAccessToken(account);

    if (videoId) {
      const video = await this.videoRepo.getByIdAsync(videoId);
      if (!video || !video.youtubeVideoId) {
        throw new YoutubeAnalyticsError('Video not found or has no YouTube ID');
      }

      try {
        const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: 'statistics',
            id: video.youtubeVideoId,
          },
        });

        const stats = response.data.items?.[0]?.statistics;
        return {
          views: parseInt(stats?.viewCount || '0', 10),
          likes: parseInt(stats?.likeCount || '0', 10),
          comments: parseInt(stats?.commentCount || '0', 10),
          watchTime: 0,
        };
      } catch (error: any) {
        logger.error('[YoutubeAnalytics] Failed to fetch single video stats', error.response?.data || error.message);
        throw new YoutubeAnalyticsError('Failed to fetch video analytics');
      }
    }

    const videos = await this.videoRepo.getByAccountIdAsync(account.id);
    const youtubeIds = videos.filter(v => v.youtubeVideoId).map(v => v.youtubeVideoId);

    if (youtubeIds.length === 0) {
      return { views: 0, likes: 0, comments: 0, watchTime: 0 };
    }

    const totals = { views: 0, likes: 0, comments: 0, watchTime: 0 };

    for (let i = 0; i < youtubeIds.length; i += 50) {
      const batch = youtubeIds.slice(i, i + 50);
      try {
        const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: 'statistics',
            id: batch.join(','),
          },
        });

        for (const item of response.data.items || []) {
          const s = item.statistics || {};
          totals.views += parseInt(s.viewCount || '0', 10);
          totals.likes += parseInt(s.likeCount || '0', 10);
          totals.comments += parseInt(s.commentCount || '0', 10);
        }
      } catch (error: any) {
        logger.error('[YoutubeAnalytics] Failed to fetch batch analytics', error.response?.data || error.message);
      }
    }

    return totals;
  }

  async syncVideoAnalytics(account: YoutubeAccount): Promise<number> {
    const videos = await this.videoRepo.getByAccountIdAsync(account.id);
    let synced = 0;

    for (const video of videos) {
      try {
        await this.getAndStoreVideoAnalytics(account, video);
        synced++;
      } catch (error) {
        logger.warn(`[YoutubeAnalytics] Failed to sync analytics for video ${video.id}`, error);
      }
    }

    return synced;
  }

  private async ensureAccessToken(account: YoutubeAccount): Promise<string> {
    const now = new Date();
    if (account.tokenExpiry > now) {
      return cryptoUtils.decrypt(account.accessToken);
    }

    logger.info('[YoutubeAnalytics] Token expired, refreshing...');
    const refreshToken = cryptoUtils.decrypt(account.refreshToken);

    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: configs.youtube.clientId,
        client_secret: configs.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const { access_token, expires_in } = response.data;
      const tokenExpiry = new Date(Date.now() + expires_in * 1000);

      account.accessToken = cryptoUtils.encrypt(access_token);
      account.tokenExpiry = tokenExpiry;
      await this.accountRepo.updateAsync(account);

      return access_token;
    } catch (error) {
      logger.error('[YoutubeAnalytics] Token refresh failed', error);
      throw new YoutubeAuthError('Failed to refresh YouTube access token');
    }
  }
}
