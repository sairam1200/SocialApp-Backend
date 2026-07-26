import { Visibility } from '../../../domain/enums';

/**
 * Who can see what.
 *
 * A single pure function, used by every read path — the feed, a profile, a
 * permalink, search, the sitemap, the Open Graph metadata endpoint and the
 * external-share preview. That is the point: the author's choice is only
 * honoured everywhere if there is only one place that decides.
 *
 * If you are adding a read path and you find yourself writing
 * `if (post.visibility === 'public')`, stop and call `canView` instead.
 */

/** What the caller is, relative to the author. Resolved once per request. */
export interface ViewerRelation {
  /** Null for an anonymous visitor. */
  viewerProfileId: string | null;
  /** The viewer is the author. */
  isAuthor: boolean;
  /** The viewer follows the author, and the follow is accepted. */
  isFollower: boolean;
  /** The viewer is in the author's close-friends audience. */
  isCloseFriend: boolean;
  /** The viewer is in the author's brand-partners audience. */
  isBrandPartner: boolean;
  /** Either party has blocked the other. Overrides everything. */
  isBlocked: boolean;
  /** Platform moderator. Sees removed content in the moderation queue only. */
  isModerator: boolean;
}

export const ANONYMOUS_VIEWER: Readonly<ViewerRelation> = Object.freeze({
  viewerProfileId: null,
  isAuthor: false,
  isFollower: false,
  isCloseFriend: false,
  isBrandPartner: false,
  isBlocked: false,
  isModerator: false,
});

/**
 * Can `viewer` see something the author published at `visibility`?
 *
 * Close friends and brand partners are *not* implied by following — they are
 * explicit memberships. A close friend who does not follow still sees close-
 * friends posts, which is what people expect and what a "followers OR close
 * friends" shortcut would get wrong in the other direction.
 */
export function canView(
  visibility: Visibility,
  viewer: ViewerRelation,
): boolean {
  if (viewer.isAuthor) return true;
  if (viewer.isBlocked) return false;

  switch (visibility) {
    case Visibility.Public:
      return true;
    case Visibility.Followers:
      return viewer.isFollower || viewer.isCloseFriend || viewer.isBrandPartner;
    case Visibility.CloseFriends:
      return viewer.isCloseFriend;
    case Visibility.BrandPartners:
      return viewer.isBrandPartner;
    case Visibility.Private:
      return false;
    default:
      // An unknown value means the enum grew and this switch did not. Deny.
      return false;
  }
}

/**
 * Is this safe to expose to crawlers, link unfurlers and the sitemap?
 *
 * Only fully public content. A followers-only post must not leak its title
 * through an Open Graph tag — the metadata is part of the content, and the
 * brief is explicit that visibility is followed "everywhere, including
 * metadata".
 */
export function isIndexable(visibility: Visibility): boolean {
  return visibility === Visibility.Public;
}

/**
 * Effective visibility of a reply, given its parent.
 *
 * A reply can never be more visible than what it replies to — otherwise a
 * public reply to a close-friends post exposes both the fact of the post and
 * usually its substance. Narrower is always allowed.
 */
export function effectiveReplyVisibility(
  requested: Visibility,
  parent: Visibility,
): Visibility {
  const rank: Record<Visibility, number> = {
    [Visibility.Public]: 0,
    [Visibility.Followers]: 1,
    [Visibility.CloseFriends]: 2,
    [Visibility.BrandPartners]: 2,
    [Visibility.Private]: 3,
  };
  return rank[requested] >= rank[parent] ? requested : parent;
}

/**
 * The visibility values a viewer could possibly see, for pushing into a SQL
 * `IN (...)` rather than filtering in application code.
 *
 * Filtering after the query would silently shrink pages — ask for 20, get 6 —
 * and paginating a post-filtered list correctly is a well-known way to lose
 * rows at page boundaries.
 */
export function visibleLevelsFor(viewer: ViewerRelation): Visibility[] {
  const levels: Visibility[] = [Visibility.Public];
  if (viewer.isFollower || viewer.isCloseFriend || viewer.isBrandPartner) {
    levels.push(Visibility.Followers);
  }
  if (viewer.isCloseFriend) levels.push(Visibility.CloseFriends);
  if (viewer.isBrandPartner) levels.push(Visibility.BrandPartners);
  return levels;
}
