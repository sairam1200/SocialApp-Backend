import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Overview ───────────────────────────────────────────────────────────────

export class OverviewMetricModel {
  @ApiProperty() label: string;
  @ApiProperty() value: number;
  @ApiProperty() changePercent: number;

  constructor(partial?: Partial<OverviewMetricModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeDashboardOverviewModel {
  @ApiProperty({ type: [OverviewMetricModel] })
  metrics: OverviewMetricModel[];

  constructor(partial?: Partial<YoutubeDashboardOverviewModel>) {
    Object.assign(this, partial);
  }
}

// ─── Daily Views ────────────────────────────────────────────────────────────

export class DailyViewsPointModel {
  @ApiProperty() date: string;
  @ApiProperty() views: number;

  constructor(partial?: Partial<DailyViewsPointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeDailyViewsModel {
  @ApiProperty({ type: [DailyViewsPointModel] })
  dailyViews: DailyViewsPointModel[];

  @ApiProperty() totalViews: number;

  constructor(partial?: Partial<YoutubeDailyViewsModel>) {
    Object.assign(this, partial);
  }
}

// ─── Watch Time ─────────────────────────────────────────────────────────────

export class WatchTimePointModel {
  @ApiProperty() date: string;
  @ApiProperty() estimatedMinutesWatched: number;
  @ApiProperty() averageViewDurationSeconds: number;

  constructor(partial?: Partial<WatchTimePointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeWatchTimeModel {
  @ApiProperty({ type: [WatchTimePointModel] })
  watchTime: WatchTimePointModel[];

  @ApiProperty() totalWatchTimeMinutes: number;

  constructor(partial?: Partial<YoutubeWatchTimeModel>) {
    Object.assign(this, partial);
  }
}

// ─── Subscriber Growth ──────────────────────────────────────────────────────

export class SubscriberGrowthPointModel {
  @ApiProperty() date: string;
  @ApiProperty() subscribersGained: number;
  @ApiProperty() subscribersLost: number;
  @ApiProperty() netChange: number;

  constructor(partial?: Partial<SubscriberGrowthPointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeSubscriberGrowthModel {
  @ApiProperty({ type: [SubscriberGrowthPointModel] })
  growth: SubscriberGrowthPointModel[];

  @ApiProperty() totalGained: number;
  @ApiProperty() totalLost: number;

  constructor(partial?: Partial<YoutubeSubscriberGrowthModel>) {
    Object.assign(this, partial);
  }
}

// ─── Top Videos ─────────────────────────────────────────────────────────────

export class TopVideoItemModel {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() thumbnail?: string;
  @ApiPropertyOptional() publishedAt?: Date;
  @ApiPropertyOptional() duration?: string;
  @ApiProperty() views: number;
  @ApiProperty() likes: number;
  @ApiProperty() comments: number;
  @ApiProperty() shares: number;
  @ApiProperty() estimatedMinutesWatched: number;
  @ApiProperty() averageViewDurationSeconds: number;
  @ApiPropertyOptional() estimatedRevenueUsd?: number;
  @ApiPropertyOptional() estimatedAdRevenueUsd?: number;

  constructor(partial?: Partial<TopVideoItemModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeTopVideosModel {
  @ApiProperty({ type: [TopVideoItemModel] })
  topVideos: TopVideoItemModel[];

  constructor(partial?: Partial<YoutubeTopVideosModel>) {
    Object.assign(this, partial);
  }
}

// ─── Traffic Sources ────────────────────────────────────────────────────────

export class TrafficSourceModel {
  @ApiProperty() source: string;
  @ApiProperty() views: number;
  @ApiProperty() watchTimeMinutes: number;
  @ApiProperty() percentage: number;

  constructor(partial?: Partial<TrafficSourceModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeTrafficSourcesModel {
  @ApiProperty({ type: [TrafficSourceModel] })
  sources: TrafficSourceModel[];

  constructor(partial?: Partial<YoutubeTrafficSourcesModel>) {
    Object.assign(this, partial);
  }
}

// ─── Audience ───────────────────────────────────────────────────────────────

export class AudienceDemographicsModel {
  @ApiProperty() gender: string;
  @ApiProperty() ageGroup: string;
  @ApiProperty() viewPercentage: number;

  constructor(partial?: Partial<AudienceDemographicsModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeAudienceModel {
  @ApiProperty({ type: [AudienceDemographicsModel] })
  demographics: AudienceDemographicsModel[];

  @ApiProperty() returnViewerPercentage: number;
  @ApiProperty() newViewerPercentage: number;
  @ApiProperty() subscribedViewerPercentage: number;

  constructor(partial?: Partial<YoutubeAudienceModel>) {
    Object.assign(this, partial);
  }
}

// ─── Geography ──────────────────────────────────────────────────────────────

export class GeographyPointModel {
  @ApiProperty() countryCode: string;
  @ApiProperty() countryName: string;
  @ApiProperty() views: number;
  @ApiProperty() watchTimeMinutes: number;
  @ApiProperty() percentage: number;

  constructor(partial?: Partial<GeographyPointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeGeographyModel {
  @ApiProperty({ type: [GeographyPointModel] })
  countries: GeographyPointModel[];

  constructor(partial?: Partial<YoutubeGeographyModel>) {
    Object.assign(this, partial);
  }
}

// ─── Devices ────────────────────────────────────────────────────────────────

export class DevicePointModel {
  @ApiProperty() deviceType: string;
  @ApiProperty() views: number;
  @ApiProperty() watchTimeMinutes: number;
  @ApiProperty() percentage: number;

  constructor(partial?: Partial<DevicePointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeDevicesModel {
  @ApiProperty({ type: [DevicePointModel] })
  devices: DevicePointModel[];

  constructor(partial?: Partial<YoutubeDevicesModel>) {
    Object.assign(this, partial);
  }
}

// ─── Playback Locations ─────────────────────────────────────────────────────

export class PlaybackLocationPointModel {
  @ApiProperty() location: string;
  @ApiProperty() views: number;
  @ApiProperty() watchTimeMinutes: number;
  @ApiProperty() percentage: number;

  constructor(partial?: Partial<PlaybackLocationPointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubePlaybackLocationsModel {
  @ApiProperty({ type: [PlaybackLocationPointModel] })
  locations: PlaybackLocationPointModel[];

  constructor(partial?: Partial<YoutubePlaybackLocationsModel>) {
    Object.assign(this, partial);
  }
}

// ─── Revenue ────────────────────────────────────────────────────────────────

export class RevenuePointModel {
  @ApiProperty() date: string;
  @ApiProperty() estimatedRevenueUsd: number;
  @ApiProperty() estimatedAdRevenueUsd: number;
  @ApiPropertyOptional() estimatedRedPartnerRevenueUsd?: number;

  constructor(partial?: Partial<RevenuePointModel>) {
    Object.assign(this, partial);
  }
}

export class YoutubeRevenueModel {
  @ApiProperty({ type: [RevenuePointModel] })
  revenue: RevenuePointModel[];

  @ApiProperty() totalRevenueUsd: number;

  constructor(partial?: Partial<YoutubeRevenueModel>) {
    Object.assign(this, partial);
  }
}
