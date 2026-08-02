import configs from '../../configs';
import {
  SearchPlaybackModel,
  SearchResultItem,
  SearchResultKind,
  SearchSourcePlatform,
  describeSource,
  toSourcePlatform,
} from '../contracts/unified-search.model';
import {
  ContentStream,
  ExternalJob,
  LiveStream,
  Post,
  Project,
  SocialProfile,
  User,
  UserContent,
} from '../entities';
import { PostKind } from '../enums';
import { summarise } from '../../core/utils/recommendation';

/**
 * Every source → one `SearchResultItem`.
 *
 * One mapper per source, all in one file, because the interesting property is
 * that they agree — the same title rules, the same URL rules, the same
 * decision about what is playable. Spread across seven files they would drift,
 * and the symptom would be cards that look subtly different depending on where
 * the result came from.
 */

function appUrl(): string {
  return (configs.frontend?.url ?? configs.app?.url ?? '').replace(/\/+$/, '');
}

/** Absolute for external, root-relative for ours — the client resolves it. */
function nativePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Is a URL something we can put in a `<video>`?
 *
 * Deliberately conservative. A page URL rendered into a video element is a
 * broken player, which is worse than an honest "open on YouTube" link — so
 * anything not obviously a media file is treated as not playable here.
 */
export function detectPlayback(
  url: string | null | undefined,
  posterUrl?: string | null,
): SearchPlaybackModel | null {
  if (!url) return null;
  const clean = url.split('?')[0].toLowerCase();

  if (/\.(m3u8)$/.test(clean)) {
    return { kind: 'hls', url, posterUrl: posterUrl ?? undefined };
  }
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) {
    return { kind: 'video', url, posterUrl: posterUrl ?? undefined };
  }
  if (/\.(mp3|m4a|aac|ogg|wav)$/.test(clean)) {
    return { kind: 'audio', url, posterUrl: posterUrl ?? undefined };
  }
  if (/\.(jpe?g|png|gif|webp|avif)$/.test(clean)) {
    return { kind: 'image', url, posterUrl: posterUrl ?? undefined };
  }
  return null;
}

/* --------------------------------------------------------------- our own */

export function mapCommunityPost(
  post: Post,
  author: SocialProfile | undefined,
  media: Array<{
    url: string;
    kind: string;
    thumbnailUrl?: string;
    duration?: number;
  }>,
): SearchResultItem {
  const lead = media[0];
  const playback = lead
    ? (detectPlayback(lead.url, lead.thumbnailUrl) ?? {
        kind: lead.kind === 'video' ? ('video' as const) : ('image' as const),
        url: lead.url,
        posterUrl: lead.thumbnailUrl,
        durationSeconds: lead.duration,
      })
    : null;

  const kind =
    post.kind === PostKind.Video || lead?.kind === 'video'
      ? SearchResultKind.Video
      : post.kind === PostKind.Photo || lead?.kind === 'image'
        ? SearchResultKind.Image
        : post.kind === PostKind.Article
          ? SearchResultKind.Article
          : SearchResultKind.Post;

  return {
    id: `gaddr:post:${post.id}`,
    kind,
    source: describeSource(SearchSourcePlatform.Gaddr),
    // A post has no title. The first line reads as one, and beats "Untitled".
    title:
      summarise((post.body ?? '').split('\n')[0], 90) ||
      `${author?.displayName ?? 'Someone'} on Community`,
    description: summarise(post.body ?? '', 220),
    thumbnailUrl:
      lead?.thumbnailUrl ?? (lead?.kind === 'image' ? lead.url : undefined),
    url: nativePath(`/community/${author?.handle ?? 'unknown'}/${post.id}`),
    publishedOn: post.publishedOn ?? post.createdOn,
    author: author
      ? {
          name: author.displayName,
          handle: author.handle,
          avatarUrl: author.avatarUrl,
          gaddrProfileHandle: author.handle,
          isVerified: author.isVerified,
        }
      : undefined,
    playback,
    topics: post.topics ?? [],
    metrics: {
      likes: post.likesCount,
      comments: post.commentsCount,
      views: post.impressionsCount,
    },
    score: 0,
    reasons: [],
  };
}

export function mapGaddrProfile(
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'userName' | 'bio'> & {
    profileImage?: string;
    followersCount?: number;
    verified?: boolean;
  },
): SearchResultItem {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.userName ||
    'Someone';

  return {
    id: `gaddr:profile:${user.id}`,
    kind: SearchResultKind.Profile,
    source: describeSource(SearchSourcePlatform.Gaddr),
    title: name,
    description: summarise(user.bio ?? '', 220),
    thumbnailUrl: user.profileImage,
    url: nativePath(`/u/${user.userName ?? user.id}`),
    publishedOn: null,
    author: {
      name,
      handle: user.userName ?? undefined,
      avatarUrl: user.profileImage,
      gaddrProfileHandle: user.userName ?? null,
      isVerified: user.verified,
    },
    playback: null,
    topics: [],
    metrics: { followers: user.followersCount },
    score: 0,
    reasons: [],
  };
}

export function mapLiveStream(
  stream: LiveStream,
  owner: SocialProfile | undefined,
  playbackUrl: string,
): SearchResultItem {
  return {
    id: `gaddr:stream:${stream.id}`,
    kind: SearchResultKind.Stream,
    source: describeSource(SearchSourcePlatform.Gaddr),
    title: stream.title ?? `${owner?.displayName ?? 'Someone'} live`,
    description: summarise(stream.description ?? '', 220),
    thumbnailUrl: stream.thumbnailUrl,
    url: nativePath(`/community/live/${stream.channelKey}`),
    publishedOn: stream.startedOn ?? null,
    author: owner
      ? {
          name: owner.displayName,
          handle: owner.handle,
          avatarUrl: owner.avatarUrl,
          gaddrProfileHandle: owner.handle,
          isVerified: owner.isVerified,
        }
      : undefined,
    playback: { kind: 'hls', url: playbackUrl, posterUrl: stream.thumbnailUrl },
    topics: stream.topics ?? [],
    metrics: { views: stream.viewersCount },
    score: 0,
    reasons: [],
  };
}

/* ------------------------------------------------------------ Gaddr Jobs */

export function mapProject(project: Project): SearchResultItem {
  const budget = project.budget ?? project.bountyAmount ?? null;

  return {
    id: `gaddr-jobs:project:${project.id}`,
    kind: SearchResultKind.Project,
    source: describeSource(SearchSourcePlatform.GaddrJobs),
    title: project.title,
    description: summarise(project.description ?? '', 220),
    // Gaddr Jobs is a separate deployment, so this is absolute rather than a
    // route — it is a different product, not a different page of this one.
    url: `${jobsUrl()}/projects/${project.id}`,
    publishedOn: project.createdAt ?? null,
    playback: null,
    topics: project.skills ?? [],
    metrics: budget
      ? {
          // `numeric` arrives as a string. Converting to minor units keeps
          // money integral all the way to the client, as everywhere else.
          priceMinor: toMinorUnits(budget),
          currency: project.currency ?? 'USD',
        }
      : undefined,
    score: 0,
    reasons: [],
  };
}

export function mapExternalJob(job: ExternalJob): SearchResultItem {
  return {
    id: `gaddr-jobs:job:${job.id}`,
    kind: SearchResultKind.Job,
    source: describeSource(SearchSourcePlatform.GaddrJobs, job.url),
    title: job.title,
    description: summarise(
      [job.company, job.location].filter(Boolean).join(' · ') ||
        job.description,
      220,
    ),
    // Aggregated by Gaddr Jobs but hosted elsewhere: the card is ours, the
    // application is not. `source.externalUrl` carries the original.
    url: `${jobsUrl()}/jobs/${job.id}`,
    publishedOn: job.postedAt ?? job.createdAt ?? null,
    author: { name: job.company },
    playback: null,
    topics: [job.jobType, job.location].filter((t): t is string => Boolean(t)),
    metrics:
      job.salaryMin || job.salary
        ? {
            priceMinor: toMinorUnits(job.salaryMin ?? ''),
            currency: job.currency ?? undefined,
          }
        : undefined,
    score: 0,
    reasons: [],
  };
}

/* ------------------------------------------------------- other platforms */

export function mapContentStream(stream: ContentStream): SearchResultItem {
  const platform = toSourcePlatform(stream.platform);
  const raw = stream as unknown as Record<string, unknown>;

  const externalUrl = pickString(raw, [
    'url',
    'link',
    'permalink',
    'sourceUrl',
  ]);
  const thumbnail = pickString(raw, [
    'thumbnailUrl',
    'thumbnail',
    'imageUrl',
    'previewUrl',
  ]);
  const mediaUrl = pickString(raw, ['mediaUrl', 'videoUrl', 'contentUrl']);
  const title = pickString(raw, ['title', 'name', 'caption']) ?? 'Untitled';
  const description = pickString(raw, ['description', 'summary', 'text']);
  const published = pickDate(raw, [
    'publishedAt',
    'createdOn',
    'lastRefreshed',
  ]);

  return {
    id: `${platform}:content:${stream.id}`,
    kind: classifyExternal(pickString(raw, ['type', 'contentType']), mediaUrl),
    source: describeSource(platform, externalUrl),
    title: summarise(title, 120),
    description: summarise(description ?? '', 220),
    thumbnailUrl: thumbnail ?? undefined,
    url: externalUrl ?? '#',
    publishedOn: published,
    author: {
      name:
        pickString(raw, [
          'authorName',
          'channelTitle',
          'creator',
          'username',
        ]) ?? platform,
      handle: pickString(raw, ['authorHandle', 'username']) ?? undefined,
      gaddrProfileHandle: null,
    },
    // Only when the platform gave us a real media file. A watch page in a
    // <video> is a broken player, and a broken player is worse than a link.
    playback: detectPlayback(mediaUrl, thumbnail),
    topics: Array.isArray(raw.tags) ? (raw.tags as string[]).slice(0, 8) : [],
    metrics: {
      views: pickNumber(raw, ['viewCount', 'views']),
      likes: pickNumber(raw, ['likeCount', 'likes']),
      comments: pickNumber(raw, ['commentCount', 'comments']),
    },
    score: 0,
    reasons: [],
  };
}

export function mapUserContent(
  content: UserContent,
  ownerHandle?: string,
): SearchResultItem {
  const raw = content as unknown as Record<string, unknown>;
  const platform = toSourcePlatform(pickString(raw, ['platform']));
  const externalUrl = pickString(raw, ['url', 'link', 'permalink']);
  const mediaUrl = pickString(raw, ['mediaUrl', 'videoUrl']);
  const thumbnail = pickString(raw, ['thumbnailUrl', 'thumbnail', 'imageUrl']);

  return {
    id: `${platform}:usercontent:${(raw.id as string) ?? ''}`,
    kind: classifyExternal(pickString(raw, ['type', 'contentType']), mediaUrl),
    // Imported *by* a Gaddr user but authored on another platform. The badge
    // names the platform, and `externalUrl` still points home — claiming it as
    // ours would be a lie about provenance.
    source: describeSource(platform, externalUrl),
    title: summarise(
      pickString(raw, ['title', 'caption', 'name']) ?? 'Untitled',
      120,
    ),
    description: summarise(pickString(raw, ['description', 'text']) ?? '', 220),
    thumbnailUrl: thumbnail ?? undefined,
    url: externalUrl ?? (ownerHandle ? nativePath(`/u/${ownerHandle}`) : '#'),
    publishedOn: pickDate(raw, ['publishedAt', 'createdOn']),
    author: ownerHandle
      ? {
          name: ownerHandle,
          handle: ownerHandle,
          gaddrProfileHandle: ownerHandle,
        }
      : undefined,
    playback: detectPlayback(mediaUrl, thumbnail),
    topics: [],
    metrics: {
      views: pickNumber(raw, ['viewCount', 'views']),
      likes: pickNumber(raw, ['likeCount', 'likes']),
    },
    score: 0,
    reasons: [],
  };
}

/* ------------------------------------------------------------- internals */

function jobsUrl(): string {
  return (configs.gaddrJobs?.url ?? `${appUrl()}/jobs`).replace(/\/+$/, '');
}

/**
 * `"1500.00"` → `"150000"`.
 *
 * Kept as a string throughout: these are `numeric` columns, and routing them
 * through `Number` loses precision on large values for no benefit.
 */
export function toMinorUnits(amount: string): string {
  const cleaned = (amount ?? '').trim();
  if (!cleaned) return '0';
  const [whole, fraction = ''] = cleaned.split('.');
  const cents = `${fraction}00`.slice(0, 2);
  const digits = `${whole.replace(/[^\d-]/g, '') || '0'}${cents}`;
  return digits.replace(/^(-?)0+(?=\d)/, '$1');
}

function classifyExternal(
  type: string | undefined,
  mediaUrl: string | undefined,
): SearchResultKind {
  const t = (type ?? '').toLowerCase();
  if (/video|reel|short|clip/.test(t)) return SearchResultKind.Video;
  if (/image|photo|pin|shot/.test(t)) return SearchResultKind.Image;
  if (/article|story|blog/.test(t)) return SearchResultKind.Article;
  if (mediaUrl && detectPlayback(mediaUrl)?.kind === 'video') {
    return SearchResultKind.Video;
  }
  return SearchResultKind.Post;
}

/**
 * Read the first key that holds a usable value.
 *
 * `contentStreams` rows were written by a dozen importers over several years
 * and do not agree on field names. Trying a list beats a switch on platform,
 * which would need editing every time a new one lands.
 */
function pickString(
  raw: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function pickNumber(
  raw: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  return undefined;
}

function pickDate(raw: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = raw[key];
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}
