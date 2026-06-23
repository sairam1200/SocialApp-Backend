import axios from 'axios';
import * as https from 'https';
import { Injectable, Inject } from '@nestjs/common';
import { Readable } from 'stream';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { cryptoUtils } from '../../../core/utils/crypto.util';
import { R2StorageService } from '../../../shared/storage/r2/r2-storage.service';
import { YoutubeAccount } from '../../../domain/entities/youtubeAccount.entity';
import { YoutubeVideo } from '../../../domain/entities/youtubeVideo.entity';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../domain/repositories/iyoutubeVideo.repository';
import {
  YoutubeAuthError,
  YoutubeUploadError,
  YoutubeRateLimitError,
} from '../../../core/exceptions/youtube-publishing.exception';

const UPLOAD_BASE_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

@Injectable()
export class YoutubePublishingService {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {}

  async ensureValidAccessToken(account: YoutubeAccount): Promise<string> {
    const now = new Date();
    if (account.tokenExpiry > now) {
      return cryptoUtils.decrypt(account.accessToken);
    }

    logger.info(`[YoutubePublishing] Token expired for channel ${account.channelId}, refreshing...`);
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
      logger.error('[YoutubePublishing] Token refresh failed', error);
      throw new YoutubeAuthError('Failed to refresh YouTube access token');
    }
  }

  async uploadVideoFromR2(
    account: YoutubeAccount,
    video: YoutubeVideo,
    r2Key: string,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<{ youtubeVideoId: string; youtubeUrl: string }> {
    const accessToken = await this.ensureValidAccessToken(account);

    onProgress?.(10, 'Initiating resumable upload...');
    const uploadUrl = await this.initResumableUpload(accessToken, video);

    onProgress?.(30, 'Uploading video to YouTube...');
    const youtubeVideoId = await this.streamUploadToYouTube(uploadUrl, accessToken, r2Key, onProgress);

    const youtubeUrl = `https://youtube.com/watch?v=${youtubeVideoId}`;
    logger.info(`[YoutubePublishing] Video uploaded successfully: ${youtubeUrl}`);

    return { youtubeVideoId, youtubeUrl };
  }

  private async initResumableUpload(accessToken: string, video: YoutubeVideo): Promise<string> {
    const metadata = {
      snippet: {
        title: video.title,
        description: video.description || '',
        tags: video.tags || [],
      },
      status: {
        privacyStatus: video.publishAt ? 'private' : (video.visibility || 'public'),
        publishAt: video.publishAt ? video.publishAt.toISOString() : undefined,
      },
    };

    return new Promise((resolve, reject) => {
      const metadataBody = JSON.stringify(metadata);
      const req = https.request({
        method: 'POST',
        hostname: 'www.googleapis.com',
        path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': '0',
          'X-Upload-Content-Type': 'video/*',
          'Content-Length': String(Buffer.byteLength(metadataBody)),
        },
        timeout: 30000,
      });

      req.on('response', (res) => {
        if (res.statusCode === 200 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            reject(new YoutubeUploadError(`YouTube resumable init failed (${res.statusCode}): ${body.substring(0, 300)}`));
          });
        }
      });

      req.on('error', (err) => reject(new YoutubeUploadError(`Resumable init connection error: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new YoutubeUploadError('Resumable init timed out')); });

      req.write(metadataBody);
      req.end();
    });
  }

  private async streamUploadToYouTube(
    uploadUrl: string,
    accessToken: string,
    r2Key: string,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<string> {
    const r2Stream = await this.r2Storage.getStream(r2Key);

    return new Promise((resolve, reject) => {
      const url = new URL(uploadUrl);
      let settled = false;
      const settle = (err?: any, result?: string) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(result!);
      };

      const req = https.request({
        method: 'PUT',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'video/*',
        },
        timeout: 600000,
      });

      req.on('response', (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode! >= 200 && res.statusCode! < 300) {
            try {
              const parsed = JSON.parse(body);
              settle(null, parsed.id);
            } catch {
              settle(new YoutubeUploadError('YouTube upload response parse error'));
            }
          } else {
            if (res.statusCode === 429 || res.statusCode === 403) {
              settle(new YoutubeRateLimitError('YouTube upload rate limit exceeded'));
            } else {
              settle(new YoutubeUploadError(`YouTube upload failed (${res.statusCode}): ${body.substring(0, 500)}`));
            }
          }
        });
        res.on('error', (err) => settle(new YoutubeUploadError(`Upload response error: ${err.message}`)));
      });

      req.on('error', (err) => settle(new YoutubeUploadError(`Upload connection error: ${err.message}`)));

      req.on('timeout', () => {
        req.destroy();
        settle(new YoutubeUploadError('YouTube upload timed out'));
      });

      r2Stream.pipe(req);
      r2Stream.on('end', () => {
        onProgress?.(90, 'Finalizing upload...');
      });
      r2Stream.on('error', (err) => {
        req.destroy();
        settle(new YoutubeUploadError(`R2 stream error: ${err.message}`));
      });
    });
  }

  async deleteFromR2(r2Key: string): Promise<void> {
    try {
      await this.r2Storage.deleteFile(r2Key);
      logger.info(`[YoutubePublishing] Deleted from R2: ${r2Key}`);
    } catch (err) {
      logger.warn(`[YoutubePublishing] Failed to delete from R2: ${r2Key}`, err);
    }
  }
}
