import axios from 'axios';
import * as https from 'https';
import { Injectable, Inject } from '@nestjs/common';
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
const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB

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
    fileSize: number | undefined,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<{ youtubeVideoId: string; youtubeUrl: string }> {
    const accessToken = await this.ensureValidAccessToken(account);

    logger.info(`[YOUTUBE UPLOAD START] videoId=${video.id} title="${video.title}" r2Key=${r2Key} fileSize=${fileSize}`);

    onProgress?.(10, 'Initiating resumable upload...');
    const uploadUrl = await this.initResumableUpload(accessToken, video);

    logger.info(`[YOUTUBE UPLOAD] Chunk Size: ${CHUNK_SIZE} (1 MB)`);
    logger.info(`[YOUTUBE UPLOAD] Upload Started`);

    onProgress?.(30, 'Uploading video to YouTube...');
    const youtubeVideoId = await this.streamUploadToYouTube(uploadUrl, accessToken, r2Key, fileSize, onProgress);

    const youtubeUrl = `https://youtube.com/watch?v=${youtubeVideoId}`;
    logger.info(`[YOUTUBE UPLOAD COMPLETED] videoId=${video.id} youtubeVideoId=${youtubeVideoId}`);

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
        if ((res.statusCode === 200 || res.statusCode === 201) && res.headers.location) {
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
    fileSize: number | undefined,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<string> {
    const r2Stream = await this.r2Storage.getStream(r2Key);

    let buffer = Buffer.alloc(0);
    let bytesUploaded = 0;
    const uploadStartTime = Date.now();

    const doFlush = async (
      endOfStream: boolean,
      settle: (err?: any, result?: string) => void,
    ): Promise<boolean> => {
      while (buffer.length >= CHUNK_SIZE || (endOfStream && buffer.length > 0)) {
        const sliceSize = endOfStream && buffer.length < CHUNK_SIZE ? buffer.length : CHUNK_SIZE;
        const slice = buffer.subarray(0, sliceSize);
        buffer = buffer.subarray(sliceSize);

        const isFinal = endOfStream && buffer.length === 0;
        const startByte = bytesUploaded;
        const endByte = bytesUploaded + slice.length - 1;

        const videoId = await this.uploadChunk(
          uploadUrl, accessToken, slice,
          startByte, endByte,
          fileSize || bytesUploaded + slice.length,
          isFinal,
        );

        bytesUploaded += slice.length;

        if (fileSize && fileSize > 0) {
          const pct = Math.round((bytesUploaded / fileSize) * 100);
          const elapsedSec = (Date.now() - uploadStartTime) / 1000;
          const speed = elapsedSec > 0 ? parseFloat((bytesUploaded / elapsedSec / (1024 * 1024)).toFixed(2)) : 0;
          logger.info(`[YOUTUBE UPLOAD] Progress: ${pct}% Speed: ${speed} MB/s`);
          const progressValue = Math.min(30 + Math.round(pct * 0.55), 85);
          onProgress?.(progressValue, `Uploading... ${pct}%`);
        }

        if (videoId) {
          settle(null, videoId);
          return true;
        }
      }
      return false;
    };

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let flushing = false;

      const settle = (err?: any, result?: string) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(result!);
      };

      const scheduleFlush = () => {
        if (flushing) return;
        flushing = true;
        doFlush(false, settle).finally(() => {
          flushing = false;
          if (!settled) {
            r2Stream.resume();
          }
        });
      };

      r2Stream.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= CHUNK_SIZE && !flushing) {
          r2Stream.pause();
          scheduleFlush();
        }
      });

      r2Stream.on('end', () => {
        const doEndFlush = async () => {
          while (flushing) {
            await new Promise((r) => setImmediate(r));
          }
          if (buffer.length > 0 && !settled) {
            flushing = true;
            await doFlush(true, settle);
            flushing = false;
          }
          if (!settled) {
            settle(new YoutubeUploadError('Upload finished but no video ID received'));
          }
        };
        doEndFlush();
      });

      r2Stream.on('error', (err) => {
        settle(new YoutubeUploadError(`R2 stream error: ${err.message}`));
      });
    });
  }

  private async uploadChunk(
    uploadUrl: string,
    accessToken: string,
    chunkData: Buffer,
    startByte: number,
    endByte: number,
    totalSize: number,
    isFinal: boolean,
  ): Promise<string | null> {
    const url = new URL(uploadUrl);
    const contentRange = isFinal
      ? `bytes ${startByte}-${endByte}/${totalSize}`
      : `bytes ${startByte}-${endByte}/*`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        method: 'PUT',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'video/*',
          'Content-Length': String(chunkData.length),
          'Content-Range': contentRange,
        },
      });

      req.on('response', (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode === 308) {
            resolve(null);
          } else if (res.statusCode! >= 200 && res.statusCode! < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.id);
            } catch {
              reject(new YoutubeUploadError('YouTube upload response parse error'));
            }
          } else {
            if (res.statusCode === 429 || res.statusCode === 403) {
              reject(new YoutubeRateLimitError('YouTube upload rate limit exceeded'));
            } else {
              reject(new YoutubeUploadError(`YouTube upload failed (${res.statusCode}): ${body.substring(0, 500)}`));
            }
          }
        });
        res.on('error', (err) => reject(new YoutubeUploadError(`Upload response error: ${err.message}`)));
      });

      req.on('error', (err) => reject(new YoutubeUploadError(`Upload connection error: ${err.message}`)));

      req.write(chunkData);
      req.end();
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
