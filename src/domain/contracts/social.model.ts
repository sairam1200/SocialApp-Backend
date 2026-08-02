import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttachmentKind,
  DisclosureKind,
  FeedMode,
  MediaKind,
  PostKind,
  PostStatus,
  ProfileKind,
  ReactionType,
  Visibility,
} from '../enums';

/**
 * API contracts for Community.
 *
 * One `PostModel` covers updates, photos, videos, stories, polls, comments,
 * reposts, clips and lives — the same decision as the single `posts` table,
 * carried through to the wire so the client also needs one renderer with
 * branches rather than ten components.
 */

export class ProfileSummaryModel {
  @ApiProperty() id: string;
  @ApiProperty() handle: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ enum: ProfileKind }) kind: ProfileKind;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional() headline?: string;
  @ApiProperty() isVerified: boolean;
  @ApiProperty() followersCount: number;
  /** Whether the *viewer* follows this profile. Null when anonymous. */
  @ApiPropertyOptional() isFollowedByViewer?: boolean | null;
}

export class MediaModel {
  @ApiProperty() id: string;
  @ApiProperty({ enum: MediaKind }) kind: MediaKind;
  @ApiProperty() url: string;
  @ApiPropertyOptional() thumbnailUrl?: string;
  @ApiPropertyOptional() width?: number;
  @ApiPropertyOptional() height?: number;
  @ApiPropertyOptional() duration?: number;
  @ApiPropertyOptional() altText?: string;
  @ApiPropertyOptional() placeholderColor?: string;
}

export class PollOptionModel {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty() votesCount: number;
  /** Share of the total, 0–1. Computed server-side so every client agrees. */
  @ApiProperty() share: number;
}

export class PollModel {
  @ApiProperty({ type: [PollOptionModel] }) options: PollOptionModel[];
  @ApiProperty() totalVotes: number;
  @ApiPropertyOptional() closesOn?: Date | null;
  @ApiProperty() isClosed: boolean;
  @ApiPropertyOptional() viewerOptionId?: string | null;
}

export class ProductTagModel {
  @ApiProperty() productId: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() priceMinor?: string;
  @ApiProperty() currency: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiPropertyOptional() url?: string;
  @ApiPropertyOptional() x?: number;
  @ApiPropertyOptional() y?: number;
  @ApiPropertyOptional() mediaIndex?: number;
}

export class PostModel {
  @ApiProperty() id: string;
  @ApiProperty({ enum: PostKind }) kind: PostKind;
  @ApiProperty({ enum: PostStatus }) status: PostStatus;
  @ApiProperty({ enum: Visibility }) visibility: Visibility;
  @ApiProperty({ type: ProfileSummaryModel }) author: ProfileSummaryModel;
  @ApiPropertyOptional() body?: string;

  @ApiProperty({ type: [MediaModel] }) media: MediaModel[];
  @ApiPropertyOptional({ type: PollModel }) poll?: PollModel | null;
  @ApiProperty({ type: [ProductTagModel] }) products: ProductTagModel[];

  @ApiPropertyOptional({ enum: AttachmentKind })
  attachmentKind?: AttachmentKind | null;
  @ApiPropertyOptional() place?: {
    name: string;
    latitude?: number;
    longitude?: number;
  } | null;
  @ApiPropertyOptional() linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
  } | null;

  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({ type: [String] }) topics: string[];
  @ApiPropertyOptional({ type: [ProfileSummaryModel] })
  mentions?: ProfileSummaryModel[];

  @ApiProperty() isSponsored: boolean;
  @ApiProperty({ enum: DisclosureKind }) disclosure: DisclosureKind;
  @ApiPropertyOptional({ type: ProfileSummaryModel })
  sponsor?: ProfileSummaryModel | null;

  @ApiPropertyOptional() parentId?: string | null;
  @ApiPropertyOptional() rootId?: string | null;
  @ApiPropertyOptional({ type: () => PostModel })
  repostOf?: PostModel | null;
  @ApiPropertyOptional() streamId?: string | null;

  @ApiProperty() likesCount: number;
  @ApiProperty() commentsCount: number;
  @ApiProperty() repostsCount: number;
  @ApiProperty() sharesCount: number;

  @ApiPropertyOptional({ enum: ReactionType })
  viewerReaction?: ReactionType | null;
  @ApiProperty() canEdit: boolean;

  @ApiPropertyOptional() scheduledFor?: Date | null;
  @ApiPropertyOptional() publishedOn?: Date | null;
  @ApiPropertyOptional() expiresOn?: Date | null;
  @ApiProperty() createdOn: Date;

  /** Absolute, canonical URL. What "share" copies and what metadata points at. */
  @ApiProperty() url: string;

  /** Why this appeared in a ranked feed. Empty in Latest. */
  @ApiProperty({ type: [String] }) reasons: string[];
}

export class FeedPageModel {
  @ApiProperty({ enum: FeedMode }) mode: FeedMode;
  @ApiProperty({ type: [PostModel] }) items: PostModel[];
  /** Pass back as `before` for the next page. Null when the feed is exhausted. */
  @ApiPropertyOptional() nextCursor?: string | null;
  @ApiProperty() hasMore: boolean;
}

export class FeedPreferencesModel {
  @ApiProperty() sources: Record<string, number>;
  @ApiProperty() objectives: Record<string, number>;
  @ApiProperty() recencyHalfLifeHours: number;
  @ApiProperty() diversityLambda: number;
  @ApiProperty() maxPostsPerAuthor: number;
  @ApiProperty() explorationStrength: number;
  @ApiProperty() sponsoredEveryN: number;
  @ApiProperty({ type: [String] }) mutedTopics: string[];
  @ApiProperty() includeOutOfNetwork: boolean;
}

export class ProfileModel extends ProfileSummaryModel {
  @ApiPropertyOptional() bio?: string;
  @ApiPropertyOptional() bannerUrl?: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() websiteUrl?: string;
  @ApiPropertyOptional() category?: string;
  @ApiProperty({ type: [String] }) topics: string[];
  @ApiProperty() followingCount: number;
  @ApiProperty() postsCount: number;
  @ApiProperty() openToCollaborations: boolean;
  @ApiProperty() tipsEnabled: boolean;
  @ApiProperty() subscriptionsEnabled: boolean;
  @ApiProperty({ enum: Visibility }) profileVisibility: Visibility;
  @ApiProperty() isViewer: boolean;
  @ApiProperty({ type: [Object] })
  certifications: Array<{
    id: string;
    title: string;
    issuedOn: Date;
    verificationCode: string;
  }>;
  @ApiProperty() createdOn: Date;
}

export class ThreadModel {
  @ApiProperty({ type: PostModel }) root: PostModel;
  @ApiProperty({ type: [PostModel] }) replies: PostModel[];
}

export class ConversationModel {
  @ApiProperty() id: string;
  @ApiProperty() kind: string;
  @ApiPropertyOptional() title?: string;
  @ApiProperty({ type: [ProfileSummaryModel] })
  participants: ProfileSummaryModel[];
  @ApiPropertyOptional() lastMessagePreview?: string;
  @ApiPropertyOptional() lastMessageOn?: Date | null;
  @ApiProperty() unreadCount: number;
}

export class MessageModel {
  @ApiProperty() id: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ type: ProfileSummaryModel }) sender: ProfileSummaryModel;
  @ApiPropertyOptional() body?: string;
  @ApiPropertyOptional({ type: PostModel }) sharedPost?: PostModel | null;
  @ApiPropertyOptional() media?: Array<{ url: string; kind: string }> | null;
  @ApiProperty() createdOn: Date;
}

export class CreatorAnalyticsModel {
  @ApiProperty() profileId: string;
  @ApiProperty() rangeDays: number;
  @ApiProperty() impressions: number;
  @ApiProperty() reach: number;
  @ApiProperty() interactions: number;
  @ApiProperty() shares: number;
  @ApiProperty() profileVisits: number;
  @ApiProperty() followersGained: number;
  @ApiProperty() engagementRate: number;
  @ApiProperty() earningsMinor: string;
  @ApiProperty() currency: string;
  @ApiProperty({ type: [Object] })
  daily: Array<{
    date: string;
    impressions: number;
    interactions: number;
    followers: number;
  }>;
  @ApiProperty({ type: [Object] })
  topPosts: Array<{
    id: string;
    body: string;
    impressions: number;
    interactions: number;
    engagementRate: number;
    publishedOn: Date | null;
  }>;
}

export class BalanceModel {
  @ApiProperty() availableMinor: string;
  @ApiProperty() pendingMinor: string;
  @ApiProperty() currency: string;
  @ApiProperty() lifetimeEarnedMinor: string;
}

export class StreamModel {
  @ApiProperty() id: string;
  @ApiProperty() channelKey: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() category?: string;
  @ApiProperty({ type: ProfileSummaryModel }) owner: ProfileSummaryModel;
  @ApiProperty() viewersCount: number;
  @ApiPropertyOptional() startedOn?: Date | null;
  @ApiPropertyOptional() thumbnailUrl?: string;
  @ApiProperty() playback: {
    hlsUrl: string;
    llHlsUrl: string;
    whepUrl: string;
  };
  @ApiProperty() chatEnabled: boolean;
}

export class StreamIngestModel {
  @ApiProperty() rtmpUrl: string;
  @ApiProperty() srtUrl: string;
  @ApiProperty() whipUrl: string;
  @ApiProperty() streamKey: string;
  /** `obs://` deep link that configures OBS in one click. */
  @ApiProperty() obsDeepLink: string;
  @ApiProperty({ type: [Object] })
  recommendedSettings: Array<{
    name: string;
    height: number;
    videoBitrateKbps: number;
    audioBitrateKbps: number;
    framerate?: number;
  }>;
}
