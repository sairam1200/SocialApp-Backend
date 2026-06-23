import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { cryptoUtils } from '../../../core/utils/crypto.util';
import { YoutubeAccount } from '../../../domain/entities/youtubeAccount.entity';
import { YoutubeVideo } from '../../../domain/entities/youtubeVideo.entity';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../domain/repositories/iyoutubeVideo.repository';
import {
  YoutubeAuthError,
  YoutubeUploadError,
  YoutubeRateLimitError,
  YoutubeDownloadError,
} from '../../../core/exceptions/youtube-publishing.exception';

const MAX_VIDEO_SIZE_BYTES = (configs.youtube.maxVideoSizeMB || 100) * 1024 * 1024;
const MAX_THUMBNAIL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_VIDEO_MIME_PREFIXES = ['video/', 'application/octet-stream'];
const ALLOWED_THUMBNAIL_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TEMP_UPLOAD_DIR = configs.youtube.tempUploadDir || os.tmpdir();

const UPLOAD_BASE_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

@Injectable()
export class YoutubePublishingService {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
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

  async uploadVideo(
    account: YoutubeAccount,
    video: YoutubeVideo,
    videoUrl: string,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<{ youtubeVideoId: string; youtubeUrl: string }> {
    const accessToken = await this.ensureValidAccessToken(account);

    const youtubeUploadsDir = path.join(TEMP_UPLOAD_DIR, 'youtube-uploads');
    if (!fs.existsSync(youtubeUploadsDir)) {
      fs.mkdirSync(youtubeUploadsDir, { recursive: true });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(videoUrl);
    } catch {
      throw new YoutubeDownloadError('videoUrl is malformed');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new YoutubeDownloadError('videoUrl must use HTTPS protocol');
    }

    const fileExt = path.extname(parsedUrl.pathname) || '.mp4';
    const tempFilePath = path.join(youtubeUploadsDir, `${crypto.randomUUID()}${fileExt}`);

    try {
      logger.info(`[YoutubePublishing] Validating video URL: ${videoUrl}`);

      let headResponse;
      try {
        headResponse = await axios({
          method: 'HEAD',
          url: videoUrl,
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });
      } catch (err: any) {
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          throw new YoutubeDownloadError(`Cannot reach storage provider at ${parsedUrl.hostname}`);
        }
        if (err.response?.status === 404) {
          throw new YoutubeDownloadError(`Video URL returned 404 — file not found at storage provider`);
        }
        if (err.response?.status === 403) {
          throw new YoutubeDownloadError(`Video URL returned 403 — access denied by storage provider`);
        }
        if (err.code === 'ECONNABORTED') {
          throw new YoutubeDownloadError('Video URL validation timed out');
        }
        throw new YoutubeDownloadError(`Failed to validate video URL: ${err.message}`);
      }

      const headContentType = headResponse.headers['content-type'] || '';
      const headContentLength = parseInt(headResponse.headers['content-length'] || '0', 10);

      const isVideoMime = ALLOWED_VIDEO_MIME_PREFIXES.some((p) => headContentType.startsWith(p));
      if (headContentType && !isVideoMime) {
        throw new YoutubeDownloadError(
          `Unsupported video content type "${headContentType}". Expected video/* or application/octet-stream`,
        );
      }

      if (headContentLength > MAX_VIDEO_SIZE_BYTES) {
        throw new YoutubeDownloadError(
          `Video file too large (${(headContentLength / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB`,
        );
      }

      logger.info(`[YoutubePublishing] Video validated: ${(headContentLength / 1024 / 1024).toFixed(1)} MB, type: ${headContentType}`);
      logger.info(`[YoutubePublishing] Downloading video from ${videoUrl}`);
      onProgress?.(10, 'Downloading video...');

      let downloadResponse;
      try {
        downloadResponse = await axios({
          method: 'GET',
          url: videoUrl,
          responseType: 'stream',
          timeout: 600000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
          headers: {
            'Accept': 'video/*, application/octet-stream',
          },
        });
      } catch (err: any) {
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          throw new YoutubeDownloadError(`Cannot reach storage provider at ${parsedUrl.hostname}`);
        }
        if (err.response?.status === 404) {
          throw new YoutubeDownloadError(`Video URL returned 404 — file not found at storage provider`);
        }
        if (err.response?.status === 403) {
          throw new YoutubeDownloadError(`Video URL returned 403 — access denied by storage provider`);
        }
        if (err.code === 'ECONNABORTED') {
          throw new YoutubeDownloadError('Video download timed out after 600 seconds');
        }
        throw new YoutubeDownloadError(`Failed to download video: ${err.message}`);
      }

      const contentType = downloadResponse.headers['content-type'] || '';
      const contentLength = parseInt(downloadResponse.headers['content-length'] || '0', 10);

      if (contentLength > MAX_VIDEO_SIZE_BYTES) {
        throw new YoutubeDownloadError(
          `Video file too large (${(contentLength / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB`,
        );
      }

      const isVideoMimeDownload = ALLOWED_VIDEO_MIME_PREFIXES.some((p) => contentType.startsWith(p));
      if (contentType && !isVideoMimeDownload) {
        throw new YoutubeDownloadError(
          `Unsupported video content type "${contentType}". Expected video/* or application/octet-stream`,
        );
      }

      const writer = fs.createWriteStream(tempFilePath);
      await new Promise<void>((resolve, reject) => {
        downloadResponse.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => reject(new YoutubeDownloadError(`Failed to save video to disk: ${err.message}`)));
      });

      const fileSize = fs.statSync(tempFilePath).size;
      logger.info(`[YoutubePublishing] Downloaded ${fileSize} bytes to ${tempFilePath}`);
      onProgress?.(50, 'Uploading to YouTube...');

      const videoMetadata = {
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

      const metadataBody = JSON.stringify(videoMetadata);
      const metadataLength = Buffer.byteLength(metadataBody);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'multipart/related; boundary=boundary123',
        'Content-Length': String(this.calculateMultipartSize(metadataLength, fileSize)),
      };

      const multipartBody = this.buildMultipartBody(metadataBody, tempFilePath);

      logger.info(`[YoutubePublishing] Uploading video to YouTube`);
      const uploadResponse = await axios.post(
        `${UPLOAD_BASE_URL}?part=snippet,status`,
        multipartBody,
        {
          headers,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 600000,
        },
      );

      const youtubeVideoId = uploadResponse.data.id;
      const youtubeUrl = `https://youtube.com/watch?v=${youtubeVideoId}`;

      logger.info(`[YoutubePublishing] Video uploaded successfully: ${youtubeUrl}`);
      onProgress?.(80, 'Finalizing...');

      return { youtubeVideoId, youtubeUrl };
    } catch (error: any) {
      if (error.response?.status === 429 || error.response?.status === 403) {
        throw new YoutubeRateLimitError('YouTube upload rate limit exceeded');
      }
      logger.error('[YoutubePublishing] Video upload failed', error.response?.data || error.message);
      throw new YoutubeUploadError(error.response?.data?.error?.message || 'Video upload failed');
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {
        logger.warn('[YoutubePublishing] Failed to clean up temp file', e);
      }
    }
  }

  async uploadThumbnail(account: YoutubeAccount, youtubeVideoId: string, thumbnailUrl: string): Promise<void> {
    const accessToken = await this.ensureValidAccessToken(account);

    const thumbDir = path.join(TEMP_UPLOAD_DIR, 'youtube-thumbnails');
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(thumbnailUrl);
    } catch {
      throw new YoutubeDownloadError('thumbnailUrl is malformed');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new YoutubeDownloadError('thumbnailUrl must use HTTPS protocol');
    }

    const fileExt = path.extname(parsedUrl.pathname) || '.jpg';
    const tempFilePath = path.join(thumbDir, `${crypto.randomUUID()}${fileExt}`);

    try {
      let downloadResponse;
      try {
        downloadResponse = await axios({
          method: 'GET',
          url: thumbnailUrl,
          responseType: 'stream',
          timeout: 60000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });
      } catch (err: any) {
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
          throw new YoutubeDownloadError(`Cannot reach storage provider at ${parsedUrl.hostname}`);
        }
        if (err.response?.status === 404) {
          throw new YoutubeDownloadError(`Thumbnail URL returned 404 — file not found at storage provider`);
        }
        throw new YoutubeDownloadError(`Failed to download thumbnail: ${err.message}`);
      }

      const contentType = downloadResponse.headers['content-type'] || '';
      const contentLength = parseInt(downloadResponse.headers['content-length'] || '0', 10);

      if (contentLength > MAX_THUMBNAIL_SIZE_BYTES) {
        throw new YoutubeDownloadError(
          `Thumbnail too large (${(contentLength / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_THUMBNAIL_SIZE_BYTES / 1024 / 1024} MB`,
        );
      }

      if (contentType && !ALLOWED_THUMBNAIL_MIME_TYPES.includes(contentType)) {
        throw new YoutubeDownloadError(
          `Unsupported thumbnail content type "${contentType}". Expected image/jpeg, image/png, or image/webp`,
        );
      }

      const writer = fs.createWriteStream(tempFilePath);
      await new Promise<void>((resolve, reject) => {
        downloadResponse.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => reject(new YoutubeDownloadError(`Failed to save thumbnail to disk: ${err.message}`)));
      });

      const imageBuffer = fs.readFileSync(tempFilePath);
      const boundary = 'thumbBoundary';
      const header = `--${boundary}\r\nContent-Type: image/${fileExt.replace('.', '')}\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([
        Buffer.from(header, 'utf-8'),
        imageBuffer,
        Buffer.from(footer, 'utf-8'),
      ]);

      await axios.post(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${youtubeVideoId}`,
        body,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(body.length),
          },
          timeout: 60000,
        },
      );

      logger.info(`[YoutubePublishing] Thumbnail uploaded for video ${youtubeVideoId}`);
    } catch (error: any) {
      logger.error('[YoutubePublishing] Thumbnail upload failed', error.response?.data || error.message);
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {
        logger.warn('[YoutubePublishing] Failed to clean up thumbnail temp file', e);
      }
    }
  }

  private buildMultipartBody(metadataJson: string, filePath: string): Buffer {
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = 'boundary123';
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    return Buffer.concat([
      Buffer.from(metadataPart, 'utf-8'),
      Buffer.from(filePart, 'utf-8'),
      fileBuffer,
      Buffer.from(footer, 'utf-8'),
    ]);
  }

  private calculateMultipartSize(metadataLength: number, fileSize: number): number {
    const boundary = 'boundary123';
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    return Buffer.byteLength(metadataPart, 'utf-8') + metadataLength + 2 +
      Buffer.byteLength(filePart, 'utf-8') + fileSize +
      Buffer.byteLength(footer, 'utf-8');
  }
}
