import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One shape for every search result.
 *
 * Search reaches seven sources — Gaddr profiles, imported content, Community
 * posts, Gaddr Jobs projects and external jobs, live channels, and aggregated
 * cross-platform content. Before this they were five differently-shaped arrays
 * the client had to branch on, which is why "All" never worked: there was
 * nothing to put in it.
 *
 * Normalising at the boundary is what makes All, For You, sorting, filtering
 * and one card component possible at all. Each source contributes a mapper;
 * everything downstream sees `SearchResultItem`.
 */

/** What a result *is*. Drives the card layout and the filter chips. */
export enum SearchResultKind {
  Profile = 'profile',
  Post = 'post',
  Video = 'video',
  Image = 'image',
  Article = 'article',
  Job = 'job',
  Project = 'project',
  Stream = 'stream',
  Course = 'course',
  Product = 'product',
}

/**
 * Where a result came from.
 *
 * `gaddr` and `gaddr-jobs` are ours. The distinction matters to the reader —
 * our own content is playable in place and belongs to an account they can
 * follow, while a YouTube result is a link off-site — so it is a first-class
 * field rather than something inferred from a URL at render time.
 */
export enum SearchSourcePlatform {
  Gaddr = 'gaddr',
  GaddrJobs = 'gaddr-jobs',
  YouTube = 'youtube',
  Instagram = 'instagram',
  TikTok = 'tiktok',
  Facebook = 'facebook',
  X = 'x',
  LinkedIn = 'linkedin',
  Pinterest = 'pinterest',
  Reddit = 'reddit',
  Spotify = 'spotify',
  GitHub = 'github',
  Apple = 'apple',
  Openverse = 'openverse',
  HackerNews = 'hackernews',
  Behance = 'behance',
  Dribbble = 'dribbble',
  Other = 'other',
}

export class SearchSourceModel {
  @ApiProperty({ enum: SearchSourcePlatform })
  platform: SearchSourcePlatform;

  /** True for `gaddr` and `gaddr-jobs`. The client badges these with our mark. */
  @ApiProperty({ description: 'Whether this is one of our own products' })
  isNative: boolean;

  /** Human label — "Gaddr", "Gaddr Jobs", "YouTube". */
  @ApiProperty()
  label: string;

  /**
   * Where the content originally lives, when that is not here.
   *
   * Note this is **not** simply the inverse of `isNative`. A job aggregated by
   * Gaddr Jobs is ours *and* hosted on someone else's board — the reader still
   * has to be able to reach the actual application. Callers pass the URL when
   * one exists; nothing is inferred.
   */
  @ApiPropertyOptional({ nullable: true })
  externalUrl?: string | null;
}

/** How a result can be played without leaving Gaddr, if it can. */
export class SearchPlaybackModel {
  @ApiProperty({ enum: ['video', 'hls', 'audio', 'embed', 'image'] })
  kind: 'video' | 'hls' | 'audio' | 'embed' | 'image';

  @ApiProperty()
  url: string;

  @ApiPropertyOptional()
  posterUrl?: string;

  @ApiPropertyOptional({ description: 'Seconds' })
  durationSeconds?: number;
}

export class SearchAuthorModel {
  @ApiProperty() name: string;
  @ApiPropertyOptional() handle?: string;
  @ApiPropertyOptional() avatarUrl?: string;
  /** Set when the author has a Gaddr profile we can link to. */
  @ApiPropertyOptional({ nullable: true }) gaddrProfileHandle?: string | null;
  @ApiPropertyOptional() isVerified?: boolean;
}

export class SearchResultItem {
  /** Stable within a response. `<platform>:<kind>:<nativeId>`. */
  @ApiProperty() id: string;

  @ApiProperty({ enum: SearchResultKind }) kind: SearchResultKind;

  @ApiProperty({ type: SearchSourceModel }) source: SearchSourceModel;

  @ApiProperty() title: string;

  @ApiPropertyOptional() description?: string;

  @ApiPropertyOptional() thumbnailUrl?: string;

  /** Where clicking the card goes — a Gaddr route for ours, else the source. */
  @ApiProperty() url: string;

  @ApiPropertyOptional({ nullable: true }) publishedOn?: Date | null;

  @ApiPropertyOptional({ type: SearchAuthorModel })
  author?: SearchAuthorModel;

  @ApiPropertyOptional({ type: SearchPlaybackModel, nullable: true })
  playback?: SearchPlaybackModel | null;

  @ApiProperty({ type: [String] }) topics: string[];

  @ApiPropertyOptional()
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    followers?: number;
    /** Minor units, as a string. Jobs and products carry money. */
    priceMinor?: string;
    currency?: string;
  };

  /**
   * Fused ranking score. Ordering is meaningful, magnitude is not — it is a
   * Reciprocal Rank Fusion score, not a relevance percentage.
   */
  @ApiProperty() score: number;

  /** Why it ranked here. Empty in chronological and random modes. */
  @ApiProperty({ type: [String] }) reasons: string[];
}

/** What the reader can ask for. */
export enum SearchMode {
  /** Every kind, fused across sources on rank. */
  All = 'all',
  /** Ranked by the recommender against the reader's affinities. */
  ForYou = 'for-you',
  /** Newest first, no ranking at all. */
  Latest = 'latest',
  /** Deliberately unranked. Deterministic per seed so paging works. */
  Random = 'random',
}

export class UnifiedSearchResponse {
  @ApiProperty({ enum: SearchMode }) mode: SearchMode;
  @ApiProperty() keyword: string;
  @ApiProperty({ type: [SearchResultItem] }) items: SearchResultItem[];
  @ApiProperty() total: number;
  @ApiProperty() hasMore: boolean;

  /**
   * How many results each source contributed, before paging.
   *
   * Shown in the UI as filter chips with counts, and invaluable when
   * debugging "why is there nothing from X" — the honest answer is usually
   * "that source returned nothing", and this says so.
   */
  @ApiProperty({ type: [Object] })
  sources: Array<{
    platform: SearchSourcePlatform;
    label: string;
    isNative: boolean;
    count: number;
  }>;

  @ApiProperty({ type: [Object] })
  kinds: Array<{ kind: SearchResultKind; count: number }>;

  /**
   * The themes actually present in this result set, most common first.
   *
   * Categories are derived rather than declared. A fixed taxonomy would need
   * curating in two places — here and in whatever each platform calls its own
   * categories — and would go stale the moment a topic caught on. These are
   * the topics on the results themselves, so the rail always describes what is
   * really there.
   */
  @ApiProperty({ type: [Object] })
  topics: Array<{ topic: string; count: number }>;
}

/** Labels, in one place, so a platform cannot be spelled two ways. */
export const SOURCE_LABELS: Readonly<Record<SearchSourcePlatform, string>> =
  Object.freeze({
    [SearchSourcePlatform.Gaddr]: 'Gaddr',
    [SearchSourcePlatform.GaddrJobs]: 'Gaddr Jobs',
    [SearchSourcePlatform.YouTube]: 'YouTube',
    [SearchSourcePlatform.Instagram]: 'Instagram',
    [SearchSourcePlatform.TikTok]: 'TikTok',
    [SearchSourcePlatform.Facebook]: 'Facebook',
    [SearchSourcePlatform.X]: 'X',
    [SearchSourcePlatform.LinkedIn]: 'LinkedIn',
    [SearchSourcePlatform.Pinterest]: 'Pinterest',
    [SearchSourcePlatform.Reddit]: 'Reddit',
    [SearchSourcePlatform.Spotify]: 'Spotify',
    [SearchSourcePlatform.GitHub]: 'GitHub',
    [SearchSourcePlatform.Apple]: 'Apple',
    [SearchSourcePlatform.Openverse]: 'Openverse',
    [SearchSourcePlatform.HackerNews]: 'Hacker News',
    [SearchSourcePlatform.Behance]: 'Behance',
    [SearchSourcePlatform.Dribbble]: 'Dribbble',
    [SearchSourcePlatform.Other]: 'Other',
  });

/** The two platforms that are ours. Everything else links off-site. */
export const NATIVE_PLATFORMS: ReadonlySet<SearchSourcePlatform> = new Set([
  SearchSourcePlatform.Gaddr,
  SearchSourcePlatform.GaddrJobs,
]);

/**
 * Map a free-form platform string onto the enum.
 *
 * Platform names arrive from `contentStreams.platform`, written by a dozen
 * different importers over time, in whatever case each of them used. An
 * unrecognised value becomes `Other` rather than being dropped — a result with
 * a vague badge is better than a missing result.
 */
export function toSourcePlatform(raw?: string | null): SearchSourcePlatform {
  const key = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (!key) return SearchSourcePlatform.Other;

  const direct = (Object.values(SearchSourcePlatform) as string[]).find(
    (value) => value === key,
  );
  if (direct) return direct as SearchSourcePlatform;

  const aliases: Record<string, SearchSourcePlatform> = {
    twitter: SearchSourcePlatform.X,
    'youtube-music': SearchSourcePlatform.YouTube,
    yt: SearchSourcePlatform.YouTube,
    ig: SearchSourcePlatform.Instagram,
    fb: SearchSourcePlatform.Facebook,
    'hacker-news': SearchSourcePlatform.HackerNews,
    hn: SearchSourcePlatform.HackerNews,
    itunes: SearchSourcePlatform.Apple,
    'apple-music': SearchSourcePlatform.Apple,
    'gaddr-me': SearchSourcePlatform.Gaddr,
    jobs: SearchSourcePlatform.GaddrJobs,
  };
  return aliases[key] ?? SearchSourcePlatform.Other;
}

/**
 * Describe a result's origin.
 *
 * `externalUrl` is whatever the caller passes — it is deliberately *not*
 * derived from `isNative`. Stripping it for native platforms looked right and
 * was wrong: it silently dropped the application link from every job Gaddr
 * Jobs aggregates from an external board. A Community post simply has no
 * external URL to pass, which gets the same result honestly.
 */
export function describeSource(
  platform: SearchSourcePlatform,
  externalUrl?: string | null,
): SearchSourceModel {
  return {
    platform,
    isNative: NATIVE_PLATFORMS.has(platform),
    label: SOURCE_LABELS[platform],
    externalUrl: externalUrl ?? null,
  };
}
