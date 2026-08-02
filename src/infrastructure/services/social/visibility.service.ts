import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { FollowStatus, Visibility } from '../../../domain/enums';
import { IUserFollowRepository } from '../../../domain/repositories';
import {
  IEngagementRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  ANONYMOUS_VIEWER,
  ViewerRelation,
  visibleLevelsFor,
} from '../../../core/utils/recommendation';
import { SocialProfile } from '../../../domain/entities/social';

/**
 * Resolves who a viewer is, relative to an author.
 *
 * Every read path needs the same three facts — do they follow, are they in a
 * narrow audience, is anyone blocked — and each is a query. Resolving them
 * once per request and passing the result down is the difference between three
 * queries and three queries per post.
 *
 * The pure decision lives in `core/utils/recommendation/visibility.ts`; this
 * only gathers the inputs.
 */
@Injectable()
export class VisibilityService {
  constructor(
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
  ) {}

  /**
   * Relation between a viewer and one author.
   *
   * Follows are stored on `identity.user_follows` by user id, while everything
   * social is keyed by profile id — so both profiles are resolved to their
   * user ids first. Keeping one follow graph rather than adding a second on
   * profiles is deliberate: two graphs would need reconciling forever.
   */
  public async resolveAsync(
    viewerProfileId: string | null,
    authorProfileId: string,
  ): Promise<ViewerRelation> {
    if (!viewerProfileId) return { ...ANONYMOUS_VIEWER };
    if (viewerProfileId === authorProfileId) {
      return {
        viewerProfileId,
        isAuthor: true,
        isFollower: true,
        isCloseFriend: true,
        isBrandPartner: true,
        isBlocked: false,
        isModerator: false,
      };
    }

    const [viewer, author, memberships, blockedIds] = await Promise.all([
      this.profiles.getByIdAsync(viewerProfileId),
      this.profiles.getByIdAsync(authorProfileId),
      this.engagement.getAudienceMembershipAsync(
        authorProfileId,
        viewerProfileId,
      ),
      this.engagement.getBlockedPairIdsAsync(viewerProfileId),
    ]);

    if (!viewer || !author) return { ...ANONYMOUS_VIEWER, viewerProfileId };

    const isBlocked = blockedIds.includes(authorProfileId);
    const follow = await this.follows.getAsync(viewer.userId, author.userId);

    return {
      viewerProfileId,
      isAuthor: false,
      isFollower: follow?.status === FollowStatus.Accepted,
      isCloseFriend: memberships.some(
        (m) => m.audience === Visibility.CloseFriends,
      ),
      isBrandPartner: memberships.some(
        (m) => m.audience === Visibility.BrandPartners,
      ),
      isBlocked,
      isModerator: false,
    };
  }

  /**
   * The levels a viewer can see across *all* authors, for a feed query.
   *
   * A feed spans many authors, so per-author resolution is not possible in one
   * SQL pass. The compromise: include `followers` when the viewer follows
   * anyone at all, then let the per-author check tighten it when a single post
   * is opened. Close-friends and brand-partner posts are only ever included
   * for authors that actually granted the viewer that audience, which the
   * caller supplies as `narrowAudienceAuthorIds`.
   */
  public async resolveFeedLevelsAsync(viewerProfileId: string | null): Promise<{
    levels: Visibility[];
    followingProfileIds: string[];
    narrowAudienceAuthorIds: string[];
    blockedProfileIds: string[];
    mutedProfileIds: string[];
  }> {
    if (!viewerProfileId) {
      return {
        levels: [Visibility.Public],
        followingProfileIds: [],
        narrowAudienceAuthorIds: [],
        blockedProfileIds: [],
        mutedProfileIds: [],
      };
    }

    const viewer = await this.profiles.getByIdAsync(viewerProfileId);
    if (!viewer) {
      return {
        levels: [Visibility.Public],
        followingProfileIds: [],
        narrowAudienceAuthorIds: [],
        blockedProfileIds: [],
        mutedProfileIds: [],
      };
    }

    const [followRows, grantedAudiences, blocked, muted] = await Promise.all([
      this.follows.getFollowingAsync(viewer.userId, FollowStatus.Accepted),
      // Audiences the viewer has been *granted*, not ones the viewer owns.
      // The owner-scoped direction answers "who is in my close friends"; this
      // answers "whose close friends am I in", which is the question the feed
      // has to answer to decide whether a narrower post is visible.
      this.engagement.listAudiencesForMemberAsync(viewerProfileId),
      this.engagement.getBlockedPairIdsAsync(viewerProfileId),
      this.engagement.getMutedIdsAsync(viewerProfileId),
    ]);

    const followedUserIds = followRows.map((f) => f.followedId);
    const followedProfiles =
      await this.profiles.getByUserIdsAsync(followedUserIds);
    const followingProfileIds = followedProfiles.map((p) => p.id);

    const isCloseFriendSomewhere = grantedAudiences.some(
      (m) => m.audience === Visibility.CloseFriends,
    );
    const isBrandPartnerSomewhere = grantedAudiences.some(
      (m) => m.audience === Visibility.BrandPartners,
    );
    const narrowAudienceAuthorIds = Array.from(
      new Set(grantedAudiences.map((m) => m.ownerProfileId)),
    );

    return {
      levels: visibleLevelsFor({
        viewerProfileId,
        isAuthor: false,
        isFollower: followingProfileIds.length > 0,
        isCloseFriend: isCloseFriendSomewhere,
        isBrandPartner: isBrandPartnerSomewhere,
        isBlocked: false,
        isModerator: false,
      }),
      followingProfileIds,
      narrowAudienceAuthorIds,
      blockedProfileIds: blocked,
      mutedProfileIds: muted,
    };
  }

  /** Ensure a profile exists for a user, creating a default one on first use. */
  public async ensureProfileAsync(
    userId: string,
    defaults: Partial<SocialProfile>,
  ): Promise<SocialProfile> {
    const existing = await this.profiles.getByUserIdAsync(userId);
    if (existing) return existing;
    return this.profiles.createAsync(
      new SocialProfile({ userId, ...defaults } as Partial<SocialProfile>),
    );
  }
}
