import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import axios from 'axios';
import configs from '../../configs';
import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import { UserContent } from '../../domain/entities/userContent.entity';
import { YoutubeChannelAnalytics } from '../../domain/entities/youtubeChannelAnalytics.entity';
import { YoutubeVideoAnalytics } from '../../domain/entities/youtubeVideoAnalytics.entity';
import { IYoutubeChannelAnalyticsRepository } from '../../domain/repositories/iyoutubeChannelAnalytics.repository';
import { IYoutubeVideoAnalyticsRepository } from '../../domain/repositories/iyoutubeVideoAnalytics.repository';
import { ILinkedAccountRepository } from '../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../domain/repositories/iuserLogin.repository';
import { IYoutubeAccountRepository } from '../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeAnalyticsService } from '../../domain/services/iyoutubeAnalytics.service';
import { deserializeObject, serializeObject } from '../../core/utils/serialization.util';

const CHANNEL_METRICS = 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares';
const REVENUE_METRICS = 'estimatedRevenue,estimatedAdRevenue';
const DIMENSION_CONFIGS: Array<{ dimension: string; metrics: string; targetField: string }> = [
  { dimension: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', targetField: 'trafficSources' },
  { dimension: 'country', metrics: 'views,estimatedMinutesWatched', targetField: 'geography' },
  { dimension: 'deviceType', metrics: 'views,estimatedMinutesWatched', targetField: 'devices' },
  { dimension: 'subscribedStatus', metrics: 'views,estimatedMinutesWatched,viewerPercentage', targetField: 'audience' },
  { dimension: 'playbackLocationType', metrics: 'views,estimatedMinutesWatched', targetField: 'playbackLocations' },
];
const INITIAL_SYNC_DAYS = 30;
const MAX_CATCHUP_DAYS = 7;

@Injectable()
export class YoutubeAnalyticsService implements IYoutubeAnalyticsService {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,

    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,

    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,

    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,

    @InjectRepository(UserContent)
    private readonly userContentContext: Repository<UserContent>,
  ) {}

  public async syncAccountAnalyticsAsync(userId: string, options: { forceRefresh?: boolean } = {}): Promise<void> {
    logger.info(`[YoutubeAnalyticsService] Starting analytics sync for user ${userId}`);

    const accessToken = await this.resolveTokenAsync(userId);
    if (!accessToken) {
      logger.warn(`[YoutubeAnalyticsService] No valid YouTube token for user ${userId}. Sync skipped.`);
      return;
    }

    try {
      const channelInfo = await this.fetchChannelInfoAsync(accessToken);
      if (!channelInfo) {
        logger.warn(`[YoutubeAnalyticsService] No channel found for user ${userId}. Sync skipped.`);
        return;
      }

      const { channelId, subscriberCount, viewCount, videoCount } = channelInfo;
      const activeAccount = await this.youtubeAccountRepository.getConnectedByUserIdAsync(userId);
      if (!activeAccount || activeAccount.channelId !== channelId) {
        logger.warn(`[YoutubeAnalyticsService] Active YouTube account mismatch for user ${userId}. active=${activeAccount?.channelId || 'none'} token=${channelId}`);
        return;
      }

      const syncDates = options.forceRefresh
        ? this.getInitialSyncDates()
        : await this.getMissingDatesAsync(channelId);

      if (syncDates.length === 0) {
        logger.info(`[YoutubeAnalyticsService] All dates already synced for user ${userId}, channel ${channelId}. Skipping.`);
        return;
      }

      const startDateStr = this.formatDate(syncDates[0]);
      const endDateStr = this.formatDate(syncDates[syncDates.length - 1]);

      // Fetch channel daily metrics from Analytics API
      await this.syncChannelDailyMetricsAsync(accessToken, userId, channelId, subscriberCount, viewCount, videoCount, startDateStr, endDateStr, syncDates);

      // Fetch optional revenue metrics independently so unavailable revenue never blocks core analytics.
      await this.syncRevenueMetricsAsync(accessToken, channelId, startDateStr, endDateStr, syncDates);

      // Fetch all supported dimension breakdowns independently.
      await this.syncDimensionDataAsync(accessToken, channelId, startDateStr, endDateStr, syncDates, Boolean(options.forceRefresh));

      // Fetch video daily metrics from Analytics API
      await this.syncVideoMetricsAsync(accessToken, userId, channelId, startDateStr, endDateStr, syncDates);

      logger.info(`[YoutubeAnalyticsService] Successfully synced YouTube Analytics for user ${userId}`);
    } catch (error: any) {
      logger.error(`[YoutubeAnalyticsService] Sync failed for user ${userId}: ${error.message}`);
    }
  }

  public async syncAllAccountsAnalyticsAsync(): Promise<void> {
    logger.info(`[YoutubeAnalyticsService] Starting background sync for all connected YouTube accounts`);
    try {
      const [accounts] = await this.linkedAccountRepository.getEntriesAsync({
        filter: { platform: _const.PLATFORMS.YOUTUBE },
        page: 1,
        pageSize: 1000,
      });

      for (const account of accounts) {
        try {
          await this.syncAccountAnalyticsAsync(account.userId);
        } catch (error) {
          logger.error(
            `[YoutubeAnalyticsService] Failed to sync YouTube analytics for user ${account.userId}:`,
            error,
          );
        }
      }
      logger.info(`[YoutubeAnalyticsService] Completed background sync for all YouTube accounts`);
    } catch (err) {
      logger.error(`[YoutubeAnalyticsService] Error retrieving YouTube accounts for background sync:`, err);
    }
  }

  public async queryReportsAsync(
    accessToken: string,
    metrics: string,
    dimensions?: string,
    filters?: string,
    startDate?: string,
    endDate?: string,
    sort?: string,
    maxResults?: number,
    startIndex?: number,
  ): Promise<{ columnHeaders: Array<{ name: string; columnType: string; dataType: string }>; rows: string[][] }> {
    const params: Record<string, string | number> = {
      ids: 'channel==MINE',
      metrics,
      ...(dimensions && { dimensions }),
      ...(filters && { filters }),
      ...(sort && { sort }),
      ...(maxResults && { maxResults }),
      ...(startIndex && { startIndex }),
    };

    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
          params,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
        });

        const data = response.data;
        return {
          columnHeaders: data.columnHeaders || [],
          rows: data.rows || [],
        };
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        if ((status === 429 || status === 500 || status === 503) && attempt < 2) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`[YoutubeAnalyticsService] reports.query transient error (${status}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        logger.error(`[YoutubeAnalyticsService] reports.query non-transient error: ${error.message}`);
        throw error;
      }
    }
    throw lastError || new Error('reports.query failed after retries');
  }

  private async resolveTokenAsync(userId: string): Promise<string | null> {
    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.YOUTUBE);
      if (!userLogin || !userLogin.tokenValue) return null;

      const tokenValue = deserializeObject<{ access_token: string; refresh_token: string }>(userLogin.tokenValue);
      if (!tokenValue.access_token) return null;

      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
      if (!isTokenValid && tokenValue.refresh_token) {
        const refreshed = await this.refreshTokenAsync(tokenValue.refresh_token);
        if (!refreshed.access_token) return null;

        userLogin.tokenValue = serializeObject({
          access_token: refreshed.access_token,
          refresh_token: tokenValue.refresh_token,
          expires_in: refreshed.expires_in,
        });
        await this.userLoginRepository.updateAsync(userLogin);
        return refreshed.access_token;
      }

      return isTokenValid ? tokenValue.access_token : null;
    } catch (err) {
      logger.warn(`[YoutubeAnalyticsService] Token resolution failed for user ${userId}: ${(err as Error).message}`);
      return null;
    }
  }

  private getInitialSyncDates(): Date[] {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dates: Date[] = [];
    for (let i = INITIAL_SYNC_DAYS; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      dates.push(d);
    }
    return dates;
  }

  private async getMissingDatesAsync(channelId: string): Promise<Date[]> {
    const lastSnapshotDate = await this.channelAnalyticsRepository.getLatestSnapshotDateByChannelIdAsync(channelId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (!lastSnapshotDate) {
      return this.getInitialSyncDates();
    }

    const diffMs = today.getTime() - lastSnapshotDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return [];

    const catchupDays = Math.min(diffDays, MAX_CATCHUP_DAYS);
    const dates: Date[] = [];
    for (let i = catchupDays; i >= 1; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      if (d > lastSnapshotDate) {
        dates.push(d);
      }
    }
    dates.push(new Date(today));
    return dates;
  }

  private async fetchChannelInfoAsync(accessToken: string): Promise<{ channelId: string; subscriberCount: number; viewCount: number; videoCount: number } | null> {
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { mine: true, part: 'snippet,statistics' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const channel = response.data.items?.[0];
      if (!channel) return null;

      const stats = channel.statistics || {};
      return {
        channelId: channel.id,
        subscriberCount: parseInt(stats.subscriberCount || '0', 10),
        viewCount: parseInt(stats.viewCount || '0', 10),
        videoCount: parseInt(stats.videoCount || '0', 10),
      };
    } catch (error: any) {
      logger.error(`[YoutubeAnalyticsService] Failed to fetch channel info: ${error.message}`);
      return null;
    }
  }

  private async syncChannelDailyMetricsAsync(
    accessToken: string, userId: string, channelId: string,
    subscriberCount: number, viewCount: number, videoCount: number,
    startDateStr: string, endDateStr: string, missingDates: Date[],
  ): Promise<void> {
    try {
      const result = await this.queryReportsAsync(
        accessToken, CHANNEL_METRICS, 'day', undefined, startDateStr, endDateStr, 'day',
      );

      if (!result.rows || result.rows.length === 0) {
        // Save empty snapshots for missing dates even if API returns no data
        for (const date of missingDates) {
          await this.saveChannelSnapshot(userId, channelId, subscriberCount, viewCount, videoCount, date, null);
        }
        return;
      }

      const colIndex = this.buildColumnIndex(result.columnHeaders);
      const rowsByDate = this.indexRowsByDate(result.rows, colIndex);

      for (const date of missingDates) {
        const dateKey = this.formatDate(date);
        const row = rowsByDate[dateKey];
        await this.saveChannelSnapshot(userId, channelId, subscriberCount, viewCount, videoCount, date, row ? { colIndex, row } : null);
      }
    } catch (error: any) {
      logger.error(`[YoutubeAnalyticsService] Channel metrics sync failed: ${error.message}`);
    }
  }

  private async syncRevenueMetricsAsync(
    accessToken: string, channelId: string,
    startDateStr: string, endDateStr: string, syncDates: Date[],
  ): Promise<void> {
    try {
      const result = await this.queryReportsAsync(
        accessToken, REVENUE_METRICS, 'day', undefined, startDateStr, endDateStr, 'day',
      );

      if (!result.rows || result.rows.length === 0) {
        logger.info(`[YoutubeAnalyticsService] Revenue metrics unavailable for channel ${channelId}.`);
        return;
      }

      const colIndex = this.buildColumnIndex(result.columnHeaders);
      const rowsByDate = this.indexRowsByDate(result.rows, colIndex);

      for (const date of syncDates) {
        const row = rowsByDate[this.formatDate(date)];
        if (!row) continue;

        const existing = await this.channelAnalyticsRepository.getByChannelIdAndDateAsync(channelId, date);
        if (!existing) continue;

        existing.estimatedRevenueUsd = this.floatVal({ colIndex, row }, 'estimatedRevenue');
        existing.estimatedAdRevenueUsd = this.floatVal({ colIndex, row }, 'estimatedAdRevenue');
        await this.channelAnalyticsRepository.createOrUpdateAsync(existing);
      }
    } catch (error: any) {
      logger.warn(`[YoutubeAnalyticsService] Revenue metrics sync skipped for channel ${channelId}: ${error.message}`);
    }
  }

  private async saveChannelSnapshot(
    userId: string, channelId: string,
    subscriberCount: number, viewCount: number, videoCount: number,
    snapshotDate: Date, apiData: { colIndex: Record<string, number>; row: string[] } | null,
  ): Promise<void> {
    const snapshot = new YoutubeChannelAnalytics({
      channelId, userId,
      subscriberCount,
      viewCount,
      videoCount,
      snapshotDate,
    });

    if (apiData) {
      snapshot.estimatedMinutesWatched = this.intVal(apiData, 'estimatedMinutesWatched');
      snapshot.averageViewDurationSeconds = this.floatVal(apiData, 'averageViewDuration');
      snapshot.subscribersGained = this.intVal(apiData, 'subscribersGained');
      snapshot.subscribersLost = this.intVal(apiData, 'subscribersLost');
      snapshot.likes = this.intVal(apiData, 'likes');
      snapshot.comments = this.intVal(apiData, 'comments');
      snapshot.shares = this.intVal(apiData, 'shares');
      snapshot.estimatedRevenueUsd = this.floatVal(apiData, 'estimatedRevenue');
      snapshot.estimatedAdRevenueUsd = this.floatVal(apiData, 'estimatedAdRevenue');
    }

    await this.channelAnalyticsRepository.createOrUpdateAsync(snapshot);
  }

  private async queryDimensionReportsPaginatedAsync(
    accessToken: string, metrics: string, dimensions: string,
    startDate: string, endDate: string,
  ): Promise<{ columnHeaders: Array<{ name: string; columnType: string; dataType: string }>; rows: string[][] }> {
    const MAX_RESULTS = 10000;
    let startIndex = 1;
    let allRows: string[][] = [];
    let columnHeaders: Array<{ name: string; columnType: string; dataType: string }> = [];

    for (let page = 0; page < 10; page++) {
      const result = await this.queryReportsAsync(
        accessToken, metrics, dimensions,
        undefined, startDate, endDate, undefined, MAX_RESULTS, startIndex,
      );

      if (page === 0) {
        columnHeaders = result.columnHeaders;
      }

      if (!result.rows || result.rows.length === 0) break;

      allRows = allRows.concat(result.rows);

      if (result.rows.length < MAX_RESULTS) break;

      startIndex += MAX_RESULTS;
    }

    return { columnHeaders, rows: allRows };
  }

  private async syncDimensionDataAsync(
    accessToken: string, channelId: string,
    startDateStr: string, endDateStr: string, syncDates: Date[], forceRefresh: boolean,
  ): Promise<void> {
    const today = this.formatDate(new Date());

    for (const dimensionConfig of DIMENSION_CONFIGS) {
      const exists = await this.hasDimensionSnapshotAsync(channelId, dimensionConfig.targetField, today);
      if (!forceRefresh && exists) continue;

      try {
        const result = await this.queryDimensionReportsPaginatedAsync(
          accessToken, dimensionConfig.metrics, `day,${dimensionConfig.dimension}`,
          startDateStr, endDateStr,
        );

        if (!result.rows || result.rows.length === 0) {
          logger.info(`[YoutubeAnalyticsService] No ${dimensionConfig.targetField} rows returned for channel ${channelId}.`);
          continue;
        }

        const dimColIndex = this.buildColumnIndex(result.columnHeaders);
        const rowsByDate = this.groupDimensionRowsByDate(result.rows, dimColIndex, dimensionConfig.dimension);

        for (const date of syncDates) {
          const dateKey = this.formatDate(date);
          const dimRows = rowsByDate[dateKey];
          if (!dimRows || dimRows.length === 0) continue;

          const existing = await this.channelAnalyticsRepository.getByChannelIdAndDateAsync(channelId, date);
          if (!existing) continue;

          Object.assign(existing, this.mapDimensionRows(dimensionConfig.targetField, dimRows, dimColIndex));
          await this.channelAnalyticsRepository.createOrUpdateAsync(existing);
        }
      } catch (error: any) {
        logger.warn(`[YoutubeAnalyticsService] Dimension sync failed for ${dimensionConfig.targetField}: ${error.message}`);
      }
    }
  }

  private mapDimensionRows(targetField: string, dimRows: Array<{ dimensionValue: string; row: string[] }>, dimColIndex: Record<string, number>): Record<string, any> {
    if (targetField === 'trafficSources') {
      return {
        trafficSources: dimRows.map((r) => ({
          source: r.dimensionValue,
          views: this.intVal({ colIndex: dimColIndex, row: r.row }, 'views'),
          watchTimeMinutes: this.intVal({ colIndex: dimColIndex, row: r.row }, 'estimatedMinutesWatched'),
        })),
      };
    }

    if (targetField === 'geography') {
      return {
        geography: dimRows.map((r) => ({
          countryCode: r.dimensionValue,
          views: this.intVal({ colIndex: dimColIndex, row: r.row }, 'views'),
          watchTimeMinutes: this.intVal({ colIndex: dimColIndex, row: r.row }, 'estimatedMinutesWatched'),
        })),
      };
    }

    if (targetField === 'devices') {
      return {
        devices: dimRows.map((r) => ({
          deviceType: r.dimensionValue,
          views: this.intVal({ colIndex: dimColIndex, row: r.row }, 'views'),
          watchTimeMinutes: this.intVal({ colIndex: dimColIndex, row: r.row }, 'estimatedMinutesWatched'),
        })),
      };
    }

    if (targetField === 'audience') {
      const subscribed = dimRows.find((r) => r.dimensionValue === 'SUBSCRIBED');
      return {
        audience: {
          subscribedViewerPercentage: subscribed ? this.floatVal({ colIndex: dimColIndex, row: subscribed.row }, 'viewerPercentage') : 0,
          returnViewerPercentage: 0,
          newViewerPercentage: 0,
        },
      };
    }

    if (targetField === 'playbackLocations') {
      return {
        playbackLocations: dimRows.map((r) => ({
          location: r.dimensionValue,
          views: this.intVal({ colIndex: dimColIndex, row: r.row }, 'views'),
          watchTimeMinutes: this.intVal({ colIndex: dimColIndex, row: r.row }, 'estimatedMinutesWatched'),
        })),
      };
    }

    return {};
  }

  private async hasDimensionSnapshotAsync(channelId: string, field: string, dateStr: string): Promise<boolean> {
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) return false;
    if (this.formatDate(latest.snapshotDate) !== dateStr) return false;

    const val = (latest as any)[field];
    if (!val) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    return true;
  }

  private async syncVideoMetricsAsync(
    accessToken: string, userId: string, channelId: string,
    startDateStr: string, endDateStr: string, missingDates: Date[],
  ): Promise<void> {
    const importedVideos = await this.userContentContext.find({
      where: {
        userId,
        platform: _const.PLATFORMS.YOUTUBE,
        type: In(['uploaded_video', 'playlist_video']),
      },
    });

    const videoIds = [
      ...new Set(
        importedVideos
          .map((v) => v.metaData?.videoId || v.externalId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    if (videoIds.length === 0) return;

    try {
      const result = await this.queryReportsAsync(
        accessToken, 'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares',
        'day,video', undefined, startDateStr, endDateStr, undefined, 5000,
      );

      if (!result.rows || result.rows.length === 0) {
        // Save empty video snapshots even if API returns no data
        for (const date of missingDates) {
          for (const videoId of videoIds) {
            await this.saveVideoSnapshot(userId, videoId, date, null);
          }
        }
        return;
      }

      const colIndex = this.buildColumnIndex(result.columnHeaders);
      const ROWS_BY_DATE_VIDEO = this.indexRowsByDateAndVideo(result.rows, colIndex);

      for (const date of missingDates) {
        const dateKey = this.formatDate(date);
        for (const videoId of videoIds) {
          const row = ROWS_BY_DATE_VIDEO[dateKey]?.[videoId];
          await this.saveVideoSnapshot(userId, videoId, date, row ? { colIndex, row } : null);
        }
      }

      // Fetch video metadata (snippet only, not statistics) after snapshots exist
      await this.fetchAndStoreVideoMetadataAsync(accessToken, userId, videoIds);
    } catch (error: any) {
      logger.error(`[YoutubeAnalyticsService] Video metrics sync failed: ${error.message}`);
      // Fallback: save empty video snapshots
      for (const date of missingDates) {
        for (const videoId of videoIds) {
          await this.saveVideoSnapshot(userId, videoId, date, null);
        }
      }
    }
  }

  private async saveVideoSnapshot(
    userId: string, videoId: string,
    snapshotDate: Date, apiData: { colIndex: Record<string, number>; row: string[] } | null,
  ): Promise<void> {
    const snapshot = new YoutubeVideoAnalytics({
      videoId, userId, snapshotDate,
    });

    if (apiData) {
      snapshot.viewCount = this.intVal(apiData, 'views');
      snapshot.estimatedMinutesWatched = this.intVal(apiData, 'estimatedMinutesWatched');
      snapshot.averageViewDurationSeconds = this.floatVal(apiData, 'averageViewDuration');
      snapshot.likeCount = this.intVal(apiData, 'likes');
      snapshot.commentCount = this.intVal(apiData, 'comments');
      snapshot.shares = this.intVal(apiData, 'shares');
    }

    await this.videoAnalyticsRepository.createOrUpdateAsync(snapshot);
  }

  private async fetchAndStoreVideoMetadataAsync(accessToken: string, userId: string, videoIds: string[]): Promise<void> {
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: { id: chunk.join(','), part: 'snippet,contentDetails' },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const videosList = response.data.items || [];
        for (const video of videosList) {
          const existing = await this.videoAnalyticsRepository.getLatestByUserIdAndVideoIdAsync(userId, video.id);
          const duration = video.contentDetails?.duration;
          const publishedAt = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : undefined;

          if (existing && existing.duration && existing.publishedAt) continue;

          if (existing) {
            existing.duration = duration || existing.duration;
            existing.publishedAt = publishedAt || existing.publishedAt;
            await this.videoAnalyticsRepository.createOrUpdateAsync(existing);
          } else if (duration || publishedAt) {
            const metaEntity = new YoutubeVideoAnalytics({
              videoId: video.id, userId,
              duration, publishedAt,
              snapshotDate: new Date(),
            });
            await this.videoAnalyticsRepository.createOrUpdateAsync(metaEntity);
          }
        }
      } catch (error: any) {
        logger.warn(`[YoutubeAnalyticsService] Failed to fetch video metadata batch: ${error.message}`);
      }
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      await axios.get(`https://oauth2.googleapis.com/tokeninfo`, {
        params: { access_token: accessToken },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async refreshTokenAsync(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    try {
      const response = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          client_id: configs.youtube.clientId,
          client_secret: configs.youtube.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new Error('Your Youtube session has expired. Access token is missing.');
      }

      return { access_token, expires_in };
    } catch (error) {
      logger.error('Failed to refresh YouTube access token:', error);
      throw error;
    }
  }

  private buildColumnIndex(columnHeaders: Array<{ name: string }>): Record<string, number> {
    const index: Record<string, number> = {};
    for (let i = 0; i < columnHeaders.length; i++) {
      index[columnHeaders[i].name] = i;
    }
    return index;
  }

  private indexRowsByDate(rows: string[][], colIndex: Record<string, number>): Record<string, string[]> {
    const dateIdx = colIndex['day'];
    if (dateIdx === undefined) return {};
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      map[row[dateIdx]] = row;
    }
    return map;
  }

  private indexRowsByDateAndVideo(rows: string[][], colIndex: Record<string, number>): Record<string, Record<string, string[]>> {
    const dateIdx = colIndex['day'];
    const videoIdx = colIndex['video'];
    if (dateIdx === undefined || videoIdx === undefined) return {};
    const map: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      const dateKey = row[dateIdx];
      const videoKey = row[videoIdx];
      if (!map[dateKey]) map[dateKey] = {};
      map[dateKey][videoKey] = row;
    }
    return map;
  }

  private groupDimensionRowsByDate(
    rows: string[][], colIndex: Record<string, number>, dimensionName: string,
  ): Record<string, Array<{ dimensionValue: string; row: string[] }>> {
    const dateIdx = colIndex['day'];
    const dimIdx = colIndex[dimensionName];
    if (dateIdx === undefined || dimIdx === undefined) return {};
    const map: Record<string, Array<{ dimensionValue: string; row: string[] }>> = {};
    for (const row of rows) {
      const dateKey = row[dateIdx];
      const dimValue = row[dimIdx];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({ dimensionValue: dimValue, row });
    }
    return map;
  }

  private intVal(apiData: { colIndex: Record<string, number>; row: string[] }, field: string): number {
    const idx = apiData.colIndex[field];
    if (idx === undefined) return 0;
    const val = apiData.row[idx];
    if (val === undefined || val === null || val === '') return 0;
    return parseInt(val, 10) || 0;
  }

  private floatVal(apiData: { colIndex: Record<string, number>; row: string[] }, field: string): number {
    const idx = apiData.colIndex[field];
    if (idx === undefined) return 0;
    const val = apiData.row[idx];
    if (val === undefined || val === null || val === '') return 0;
    return parseFloat(val) || 0;
  }

  private formatDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
