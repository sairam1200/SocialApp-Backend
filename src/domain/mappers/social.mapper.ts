import configs from '../../configs';
import {
  MediaModel,
  PollModel,
  PostModel,
  ProductTagModel,
  ProfileModel,
  ProfileSummaryModel,
} from '../contracts/social.model';
import {
  AudienceMember,
  Certification,
  PollOption,
  PollVote,
  Post,
  PostMedia,
  PostProduct,
  Product,
  Reaction,
  SocialProfile,
} from '../entities/social';
import { PostKind, Visibility } from '../enums';

/**
 * Entity → API model.
 *
 * One place, used by every endpoint. When something is added to `PostModel`,
 * it appears everywhere at once instead of in the four handlers someone
 * remembered — that is the whole reason mapping is centralised rather than
 * done inline where it is convenient.
 */

/** Everything needed to build a batch of `PostModel`s without N+1 lookups. */
export interface PostMapContext {
  authors: Map<string, SocialProfile>;
  media: Map<string, PostMedia[]>;
  pollOptions: Map<string, PollOption[]>;
  productTags: Map<string, PostProduct[]>;
  products: Map<string, Product>;
  viewerReactions: Map<string, Reaction>;
  viewerPollVotes: Map<string, PollVote>;
  viewerProfileId: string | null;
  followingProfileIds: Set<string>;
  reasonsById?: Map<string, string[]>;
  repostTargets?: Map<string, Post>;
}

export function emptyPostMapContext(
  viewerProfileId: string | null = null,
): PostMapContext {
  return {
    authors: new Map(),
    media: new Map(),
    pollOptions: new Map(),
    productTags: new Map(),
    products: new Map(),
    viewerReactions: new Map(),
    viewerPollVotes: new Map(),
    viewerProfileId,
    followingProfileIds: new Set(),
  };
}

export function mapProfileSummary(
  profile: SocialProfile | undefined,
  context?: Pick<PostMapContext, 'followingProfileIds' | 'viewerProfileId'>,
): ProfileSummaryModel {
  if (!profile) {
    // A deleted author still has posts in a cached page. Rendering "Unknown"
    // beats the page failing to map.
    return {
      id: '',
      handle: 'unknown',
      displayName: 'Unknown',
      kind: 'person' as ProfileSummaryModel['kind'],
      isVerified: false,
      followersCount: 0,
      isFollowedByViewer: null,
    };
  }
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    kind: profile.kind,
    avatarUrl: profile.avatarUrl,
    headline: profile.headline,
    isVerified: profile.isVerified,
    followersCount: profile.followersCount,
    isFollowedByViewer: context?.viewerProfileId
      ? context.followingProfileIds.has(profile.id)
      : null,
  };
}

function mapMedia(media: PostMedia[]): MediaModel[] {
  return media
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      width: m.width,
      height: m.height,
      duration: m.duration,
      altText: m.altText,
      placeholderColor: m.placeholderColor,
    }));
}

function mapPoll(
  post: Post,
  options: PollOption[],
  viewerVote: PollVote | undefined,
): PollModel | null {
  if (post.kind !== PostKind.Poll || options.length === 0) return null;
  const totalVotes = options.reduce((sum, o) => sum + o.votesCount, 0);
  return {
    options: options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        id: o.id,
        label: o.label,
        votesCount: o.votesCount,
        share: totalVotes > 0 ? o.votesCount / totalVotes : 0,
      })),
    totalVotes,
    closesOn: post.expiresOn ?? null,
    isClosed: Boolean(post.expiresOn && post.expiresOn.getTime() <= Date.now()),
    viewerOptionId: viewerVote?.optionId ?? null,
  };
}

function mapProductTags(
  tags: PostProduct[],
  products: Map<string, Product>,
): ProductTagModel[] {
  return tags
    .map((tag) => {
      const product = products.get(tag.productId);
      if (!product) return null;
      const model: ProductTagModel = {
        productId: product.id,
        title: product.title,
        priceMinor: product.priceMinor ?? undefined,
        currency: product.currency,
        imageUrl: product.imageUrl,
        url: product.externalUrl,
        x: tag.x,
        y: tag.y,
        mediaIndex: tag.mediaIndex,
      };
      return model;
    })
    .filter((t): t is ProductTagModel => t !== null);
}

/** Canonical, absolute permalink. The single definition of a post's URL. */
export function postUrl(post: Post, authorHandle: string): string {
  const base = (configs.frontend?.url ?? configs.app?.url ?? '').replace(
    /\/+$/,
    '',
  );
  return `${base}/community/${authorHandle}/${post.id}`;
}

export function mapPost(post: Post, context: PostMapContext): PostModel {
  const author = context.authors.get(post.authorProfileId);
  const media = context.media.get(post.id) ?? [];
  const options = context.pollOptions.get(post.id) ?? [];
  const tags = context.productTags.get(post.id) ?? [];
  const repostTarget = post.repostOfId
    ? context.repostTargets?.get(post.repostOfId)
    : undefined;

  return {
    id: post.id,
    kind: post.kind,
    status: post.status,
    visibility: post.visibility,
    author: mapProfileSummary(author, context),
    body: post.body ?? undefined,
    media: mapMedia(media),
    poll: mapPoll(post, options, context.viewerPollVotes.get(post.id)),
    products: mapProductTags(tags, context.products),
    attachmentKind: post.attachmentKind ?? null,
    place: post.place ?? null,
    linkPreview: post.linkPreview ?? null,
    tags: post.tags ?? [],
    topics: post.topics ?? [],
    mentions: (post.mentionedProfileIds ?? [])
      .map((id) => context.authors.get(id))
      .filter((p): p is SocialProfile => Boolean(p))
      .map((p) => mapProfileSummary(p, context)),
    isSponsored: post.isSponsored,
    disclosure: post.disclosure,
    sponsor: post.sponsorProfileId
      ? mapProfileSummary(context.authors.get(post.sponsorProfileId), context)
      : null,
    parentId: post.parentId ?? null,
    rootId: post.rootId ?? null,
    // One level only. A repost of a repost renders the original, which is what
    // the reader means; recursing further would let a chain blow the response.
    repostOf: repostTarget
      ? mapPost(repostTarget, { ...context, repostTargets: undefined })
      : null,
    streamId: post.streamId ?? null,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    repostsCount: post.repostsCount,
    sharesCount: post.sharesCount,
    viewerReaction: context.viewerReactions.get(post.id)?.type ?? null,
    canEdit: context.viewerProfileId === post.authorProfileId,
    scheduledFor: post.scheduledFor ?? null,
    publishedOn: post.publishedOn ?? null,
    expiresOn: post.expiresOn ?? null,
    createdOn: post.createdOn,
    url: postUrl(post, author?.handle ?? 'unknown'),
    reasons: context.reasonsById?.get(post.id) ?? [],
  };
}

export function mapProfile(
  profile: SocialProfile,
  input: {
    viewerProfileId: string | null;
    isFollowedByViewer: boolean;
    certifications: Certification[];
  },
): ProfileModel {
  return {
    ...mapProfileSummary(profile, {
      viewerProfileId: input.viewerProfileId,
      followingProfileIds: new Set(
        input.isFollowedByViewer ? [profile.id] : [],
      ),
    }),
    bio: profile.bio,
    bannerUrl: profile.bannerUrl,
    location: profile.location,
    websiteUrl: profile.websiteUrl,
    category: profile.category,
    topics: profile.topics ?? [],
    followingCount: profile.followingCount,
    postsCount: profile.postsCount,
    openToCollaborations: profile.openToCollaborations,
    tipsEnabled: profile.tipsEnabled,
    subscriptionsEnabled: profile.subscriptionsEnabled,
    profileVisibility: profile.profileVisibility,
    isViewer: input.viewerProfileId === profile.id,
    certifications: input.certifications
      // A certificate the learner made private stays off the public profile.
      .filter((c) => c.visibility === Visibility.Public)
      .map((c) => ({
        id: c.id,
        title: c.title,
        issuedOn: c.issuedOn,
        verificationCode: c.verificationCode,
      })),
    createdOn: profile.createdOn,
  };
}

/** Members of an author's narrow audience, as summaries. */
export function mapAudience(
  members: AudienceMember[],
  profiles: Map<string, SocialProfile>,
): ProfileSummaryModel[] {
  return members
    .map((m) => profiles.get(m.memberProfileId))
    .filter((p): p is SocialProfile => Boolean(p))
    .map((p) => mapProfileSummary(p));
}
