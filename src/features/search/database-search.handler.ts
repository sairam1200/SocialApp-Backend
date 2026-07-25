import * as Joi from 'joi';
import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import _const from '../../core/utils/const';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { PagedResult } from '../../domain/contracts/pagination/pagedResult';
import {
  IUserContentRepository,
  IIdentityRepository,
} from '../../domain/repositories';
import { IProjectRepository } from '../../domain/repositories/iproject.repository';
import { IUserFollowRepository } from '../../domain/repositories/iuserFollow.repository';
import { IContentStreamRepository } from '../../domain/repositories/icontentStream.repository';
import { ContentStream } from '../../domain/entities/contentStream.entity';
import { SearchContentProjection } from '../../domain/repositories/iuserContent.repository';
import { SearchUserProjection } from '../../domain/repositories/iidentity.repository';
import { GetPublicProfileQuery } from '../profile/public-profile/get-public-profile.handler';
import { getProfileImageUrl } from '../../core/utils/profileImagePrivacy.util';

export type SearchSuggestion = {
  id: string;
  type: 'user' | 'userContent' | 'project' | 'aggregated';
  label: string;
  userName?: string;
  href?: string;
  creatorName?: string;
  platform?: string;
};

/**
 * A single aggregated cross-platform result, as surfaced to the client.
 *
 * Deliberately a projection rather than the raw `ContentStream` entity: `metaData`
 * is whatever shape the source platform returned, so exposing it wholesale would
 * make the API contract depend on twelve third-party response formats. This narrows
 * it to the fields a result card actually needs, and normalises the differences
 * between platforms (YouTube calls it a description, Facebook a message, Instagram
 * a caption).
 */
export type AggregatedSearchResult = {
  id: string;
  platform: string;
  /** 'Profile' or 'Content'. */
  type: string;
  /** Platform-specific kind: video, channel, playlist, pin, board, track… */
  subType: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  url: string | null;
  externalId: string;
  /** When this row was last refreshed from the source platform. */
  lastRefreshed: Date | null;
};

/** Best-effort extraction of a thumbnail across differing platform payloads. */
function extractThumbnail(meta: Record<string, any> | null): string | null {
  if (!meta) return null;

  const candidates = [
    meta.thumbnails?.high?.url,
    meta.thumbnails?.medium?.url,
    meta.thumbnails?.default?.url,
    meta.thumbnail_url,
    meta.thumbnailUrl,
    meta.image?.url,
    meta.images?.[0]?.url,
    meta.media_url,
    meta.picture?.data?.url,
    meta.profileImage,
  ];

  return candidates.find((c) => typeof c === 'string' && c.length > 0) ?? null;
}

/**
 * Reconstruct a canonical link back to the source platform.
 *
 * Preferred over any URL in `metaData`, because several platforms return
 * short-lived signed CDN URLs that expire — a stored one would 404 for the user.
 */
function buildSourceUrl(
  platform: string,
  subType: string | null,
  externalId: string,
  meta: Record<string, any> | null,
): string | null {
  const explicit = meta?.permalink ?? meta?.permalink_url ?? meta?.externalUrl;
  if (typeof explicit === 'string' && explicit.startsWith('http')) {
    return explicit;
  }

  if (!externalId) return null;

  switch (platform) {
    case 'youtube':
      if (subType === 'channel')
        return `https://www.youtube.com/channel/${externalId}`;
      if (subType === 'playlist')
        return `https://www.youtube.com/playlist?list=${externalId}`;
      return `https://www.youtube.com/watch?v=${externalId}`;
    case 'apple':
    case 'openverse':
    case 'hackernews':
      // These carry a real landing URL in metaData.externalUrl (handled above); their
      // ids are opaque, so there is no path to construct.
      return null;
    case 'github':
      // GitHub's numeric ids are not addressable, so the URL must come from the stored
      // metaData (`externalUrl`, handled above). Returning null beats guessing a path.
      return null;
    case 'reddit':
      return `https://www.reddit.com/${externalId}`;
    case 'pinterest':
      return `https://www.pinterest.com/pin/${externalId}`;
    case 'tiktok':
      return `https://www.tiktok.com/@/video/${externalId}`;
    case 'spotify':
      return `https://open.spotify.com/${subType ?? 'track'}/${externalId}`;
    case 'twitter':
      return `https://x.com/i/status/${externalId}`;
    default:
      return null;
  }
}

function toAggregatedResult(stream: ContentStream): AggregatedSearchResult {
  const meta = (stream.metaData ?? null) as Record<string, any> | null;

  return {
    id: stream.id,
    platform: stream.platform,
    type: stream.type,
    subType: stream.subType ?? null,
    title: stream.title ?? '',
    // Each platform names its body text differently.
    description:
      meta?.description ??
      meta?.message ??
      meta?.caption ??
      meta?.selftext ??
      null,
    thumbnailUrl: extractThumbnail(meta),
    url: buildSourceUrl(
      stream.platform,
      stream.subType ?? null,
      stream.externalId,
      meta,
    ),
    externalId: stream.externalId,
    lastRefreshed: stream.lastRefreshed ?? null,
  };
}

export class SearchSuggestionsQuery {
  keyword: string;
  constructor(request: Partial<SearchSuggestionsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class SearchResultsQuery {
  keyword: string;
  page = 1;
  limit = 20;
  constructor(request: Partial<SearchResultsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class SearchItemQuery {
  id: string;
  type: 'user' | 'userContent';
  constructor(request: Partial<SearchItemQuery> = {}) {
    Object.assign(this, request);
  }
}

const keywordSchema = Joi.string().trim().min(1).max(200).required();
const suggestionsSchema = Joi.object<SearchSuggestionsQuery>({
  keyword: keywordSchema.min(3),
});
const resultsSchema = Joi.object<SearchResultsQuery>({
  keyword: keywordSchema,
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
const itemSchema = Joi.object<SearchItemQuery>({
  id: Joi.string().uuid().required(),
  type: Joi.string().valid('user', 'userContent').required(),
});

/**
 * Exported for tests only.
 *
 * These are pure functions and are where this feature breaks quietly — a wrong
 * source URL still renders a result card, it just sends the user to a 404. Grouping
 * them under a single named export keeps them out of the module's public surface
 * while still allowing them to be tested directly, rather than only through a
 * handler that needs four repositories mocked.
 */
export const __testables = {
  toAggregatedResult,
  buildSourceUrl,
  extractThumbnail,
};

@QueryHandler(SearchSuggestionsQuery)
export class SearchSuggestionsQueryHandler implements IQueryHandler<SearchSuggestionsQuery> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly contents: IUserContentRepository,
    @Inject(_const.IPROJECT_REPOSITORY)
    private readonly projects: IProjectRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreams: IContentStreamRepository,
  ) {}

  async execute(
    query: SearchSuggestionsQuery,
  ): Promise<{ suggestions: SearchSuggestion[] }> {
    const value = await suggestionsSchema.validateAsync(query, {
      stripUnknown: true,
    });
    const viewerId = HttpContext.getCurrentUserId;
    const [[profiles], [contents], projects, [streams]] = await Promise.all([
      this.users.searchGlobalAsync(value.keyword, viewerId, 1, 5),
      this.contents.searchGlobalAsync(value.keyword, viewerId, 1, 5),
      this.projects.searchSuggestionsAsync(value.keyword, 5),
      // Aggregated content also feeds suggestions, so typing a term that only
      // matches cross-platform results still produces autocomplete.
      this.contentStreams
        .getEntriesAsync({
          page: 1,
          pageSize: 5,
          searchQuery: value.keyword,
          orderBy: 'lastRefreshed',
          order: 'DESC',
        })
        .catch(() => [[], 0] as [ContentStream[], number]),
    ]);
    const suggestions = [
      ...profiles.map((user) => ({
        id: user.id,
        type: 'user' as const,
        label:
          `${user.firstName} ${user.lastName}`.trim() || user.userName || '',
        userName: user.userName,
      })),
      ...contents.map((content) => ({
        id: content.id,
        type: 'userContent' as const,
        label: this.getContentLabel(content),
        href: content.sourceUrl,
        creatorName:
          `${content.user.firstName} ${content.user.lastName}`.trim() ||
          content.user.userName,
      })),
      ...projects.map((project) => ({
        id: String(project.id),
        type: 'project' as const,
        label: project.title || '',
      })),
      ...streams.map((stream) => {
        const aggregated = toAggregatedResult(stream);
        return {
          id: aggregated.id,
          type: 'aggregated' as const,
          label: aggregated.title,
          href: aggregated.url ?? undefined,
          platform: aggregated.platform,
        };
      }),
    ]
      .sort(
        (a, b) =>
          this.rank(a.label, value.keyword) -
            this.rank(b.label, value.keyword) || a.label.localeCompare(b.label),
      )
      .slice(0, 5);
    return { suggestions };
  }

  private rank(label: string, keyword: string): number {
    const normalized = label.toLocaleLowerCase();
    const search = keyword.toLocaleLowerCase();
    return normalized === search ? 0 : normalized.startsWith(search) ? 1 : 2;
  }

  private getContentLabel(content: SearchContentProjection): string {
    const meta = content.metaData;
    switch (content.platform) {
      case 'facebook':
        return meta?.message || content.title || '';
      case 'instagram':
        return meta?.caption || content.title || '';
      case 'pinterest':
      case 'youtube':
        return content.title || meta?.description || '';
      default:
        return content.title || '';
    }
  }
}

@QueryHandler(SearchResultsQuery)
export class SearchResultsQueryHandler implements IQueryHandler<SearchResultsQuery> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly contents: IUserContentRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreams: IContentStreamRepository,
  ) {}

  async execute(query: SearchResultsQuery): Promise<{
    profiles: SearchUserProjection[];
    contents: SearchContentProjection[];
    aggregated: AggregatedSearchResult[];
    pagination: {
      page: number;
      limit: number;
      profiles: PagedResult<null>;
      contents: PagedResult<null>;
      aggregated: PagedResult<null>;
    };
  }> {
    const value = await resultsSchema.validateAsync(query, {
      stripUnknown: true,
    });
    const viewerId = HttpContext.getCurrentUserId;
    const [
      [profiles, profileTotal],
      [contents, contentTotal],
      [streams, streamTotal],
    ] = await Promise.all([
      this.users.searchGlobalAsync(
        value.keyword,
        viewerId,
        value.page,
        value.limit,
      ),
      this.contents.searchGlobalAsync(
        value.keyword,
        viewerId,
        value.page,
        value.limit,
      ),
      // Aggregated cross-platform content. Previously absent: POST /search
      // persisted every platform result into contentStreams, but this handler —
      // the one the UI calls — only read native Gaddr tables, so aggregated
      // content was saved and never surfaced. Verified end-to-end: a YouTube
      // search wrote 11 rows while GET /search/results returned an empty set.
      //
      // Failures are swallowed rather than propagated: aggregated content is
      // supplementary, and it must not be able to take down profile and native
      // content search.
      this.contentStreams
        .getEntriesAsync({
          page: value.page,
          pageSize: value.limit,
          searchQuery: value.keyword,
          orderBy: 'lastRefreshed',
          order: 'DESC',
        })
        .catch(() => [[], 0] as [ContentStream[], number]),
    ]);

    const resolvedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const resolvedUrl = await getProfileImageUrl(
          profile.profileImageUrl ?? null,
          profile.defaultProfileImageUrl ?? null,
          profile.profileImagePrivacy as any,
          profile.id,
          viewerId,
          this.userFollowRepository,
        );
        return {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          userName: profile.userName,
          bio: profile.bio,
          profileImage: resolvedUrl ?? undefined,
          followersCount: profile.followersCount,
          followingCount: profile.followingCount,
          totalPosts: profile.totalPosts,
          linkedAccounts: profile.linkedAccounts,
          verified: profile.verified,
          isFollowing: profile.isFollowing,
        };
      }),
    );

    const resolvedContents = await Promise.all(
      contents.map(async (content) => {
        const resolvedUrl = await getProfileImageUrl(
          content.user.profileImageUrl ?? null,
          content.user.defaultProfileImageUrl ?? null,
          content.user.profileImagePrivacy as any,
          content.user.id,
          viewerId,
          this.userFollowRepository,
        );
        return {
          ...content,
          user: {
            id: content.user.id,
            firstName: content.user.firstName,
            lastName: content.user.lastName,
            userName: content.user.userName,
            bio: content.user.bio,
            profileImage: resolvedUrl ?? null,
          },
        };
      }),
    );

    return {
      profiles: resolvedProfiles,
      contents: resolvedContents,
      aggregated: streams.map(toAggregatedResult),
      pagination: {
        page: value.page,
        limit: value.limit,
        profiles: new PagedResult(null, profileTotal),
        contents: new PagedResult(null, contentTotal),
        aggregated: new PagedResult(null, streamTotal),
      },
    };
  }
}

@QueryHandler(SearchItemQuery)
export class SearchItemQueryHandler implements IQueryHandler<SearchItemQuery> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly contents: IUserContentRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly userFollowRepository: IUserFollowRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: SearchItemQuery): Promise<{
    user?: unknown;
    content?: Omit<SearchContentProjection, 'user'>;
  }> {
    const value = await itemSchema.validateAsync(query, { stripUnknown: true });
    if (value.type === 'user') {
      const user = await this.users.getUserByIdAsync(value.id);
      if (!user?.isActive || !user.userName)
        throw new NotFoundException('User not found');
      return {
        user: await this.queryBus.execute(
          new GetPublicProfileQuery({ userName: user.userName }),
        ),
      };
    }
    const content = await this.contents.getGlobalSearchItemAsync(
      value.id,
      HttpContext.getCurrentUserId,
    );
    if (!content) throw new NotFoundException('Content not found');
    const { user, ...item } = content;

    const viewerId = HttpContext.getCurrentUserId;
    let resolvedProfileImage: string | null = null;
    if (user) {
      resolvedProfileImage = await getProfileImageUrl(
        user.profileImageUrl ?? null,
        user.defaultProfileImageUrl ?? null,
        user.profileImagePrivacy as any,
        user.id,
        viewerId,
        this.userFollowRepository,
      );
    }

    return {
      content: item,
      user: user
        ? {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            userName: user.userName,
            bio: user.bio,
            profileImage: resolvedProfileImage ?? null,
          }
        : undefined,
    };
  }
}
