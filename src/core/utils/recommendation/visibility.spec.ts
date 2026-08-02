import { Visibility } from '../../../domain/enums';
import {
  ANONYMOUS_VIEWER,
  ViewerRelation,
  canView,
  effectiveReplyVisibility,
  isIndexable,
  visibleLevelsFor,
} from './visibility';
import { PUBLIC_SCOPE, visibilityPredicate } from './visibility-scope';

const relation = (overrides: Partial<ViewerRelation> = {}): ViewerRelation => ({
  ...ANONYMOUS_VIEWER,
  viewerProfileId: 'viewer',
  ...overrides,
});

/**
 * The author's choice is only honoured everywhere if there is one function
 * that decides. These tests are that function's contract.
 */
describe('canView', () => {
  it('shows public posts to anyone, including anonymous visitors', () => {
    expect(canView(Visibility.Public, { ...ANONYMOUS_VIEWER })).toBe(true);
  });

  it('shows the author everything, including their own private posts', () => {
    const author = relation({ isAuthor: true });
    for (const level of Object.values(Visibility)) {
      expect(canView(level, author)).toBe(true);
    }
  });

  it('hides everything from a blocked viewer, even public posts', () => {
    expect(canView(Visibility.Public, relation({ isBlocked: true }))).toBe(
      false,
    );
  });

  it('does not let a block hide the author from themselves', () => {
    expect(
      canView(
        Visibility.Private,
        relation({ isAuthor: true, isBlocked: true }),
      ),
    ).toBe(true);
  });

  it('treats close friends and brand partners as followers too', () => {
    expect(
      canView(Visibility.Followers, relation({ isCloseFriend: true })),
    ).toBe(true);
    expect(
      canView(Visibility.Followers, relation({ isBrandPartner: true })),
    ).toBe(true);
  });

  it('does not imply close-friend access from following', () => {
    // The common mistake is `followers OR closeFriends`, which leaks the
    // narrower audience to every follower.
    expect(
      canView(Visibility.CloseFriends, relation({ isFollower: true })),
    ).toBe(false);
  });

  it('grants close-friend access without a follow', () => {
    // And the mirror mistake: requiring a follow, which hides posts from a
    // close friend who never followed.
    expect(
      canView(Visibility.CloseFriends, relation({ isCloseFriend: true })),
    ).toBe(true);
  });

  it('keeps brand-partner and close-friend audiences separate', () => {
    expect(
      canView(Visibility.BrandPartners, relation({ isCloseFriend: true })),
    ).toBe(false);
  });

  it('hides private posts from everyone but the author', () => {
    expect(
      canView(
        Visibility.Private,
        relation({
          isFollower: true,
          isCloseFriend: true,
          isBrandPartner: true,
        }),
      ),
    ).toBe(false);
  });

  it('denies an unknown visibility rather than defaulting to visible', () => {
    expect(canView('something-new' as Visibility, relation())).toBe(false);
  });
});

describe('isIndexable', () => {
  it('only allows public content into metadata and the sitemap', () => {
    expect(isIndexable(Visibility.Public)).toBe(true);
    for (const level of [
      Visibility.Followers,
      Visibility.CloseFriends,
      Visibility.BrandPartners,
      Visibility.Private,
    ]) {
      expect(isIndexable(level)).toBe(false);
    }
  });
});

describe('effectiveReplyVisibility', () => {
  it('never lets a reply be wider than its parent', () => {
    expect(
      effectiveReplyVisibility(Visibility.Public, Visibility.CloseFriends),
    ).toBe(Visibility.CloseFriends);
  });

  it('allows a narrower reply', () => {
    expect(
      effectiveReplyVisibility(Visibility.CloseFriends, Visibility.Public),
    ).toBe(Visibility.CloseFriends);
  });

  it('leaves an equal request alone', () => {
    expect(effectiveReplyVisibility(Visibility.Public, Visibility.Public)).toBe(
      Visibility.Public,
    );
  });
});

describe('visibleLevelsFor', () => {
  it('gives an anonymous viewer public only', () => {
    expect(visibleLevelsFor({ ...ANONYMOUS_VIEWER })).toEqual([
      Visibility.Public,
    ]);
  });

  it('adds followers for a follower and never adds private', () => {
    const levels = visibleLevelsFor(relation({ isFollower: true }));
    expect(levels).toContain(Visibility.Followers);
    expect(levels).not.toContain(Visibility.Private);
  });
});

describe('visibilityPredicate', () => {
  it('is public-only for an anonymous scope', () => {
    const { sql, parameters } = visibilityPredicate('p', PUBLIC_SCOPE);
    expect(sql).toBe(`(p."visibility" = 'public')`);
    expect(parameters).toEqual({});
  });

  it('pairs each narrower level with the authors that granted it', () => {
    // A flat `visibility IN (...)` would show every author's close-friends
    // posts to anyone who is somebody's close friend. The predicate must bind
    // the level to the author.
    const { sql, parameters } = visibilityPredicate('p', {
      viewerProfileId: 'me',
      followingProfileIds: ['anna'],
      closeFriendOfProfileIds: ['bo'],
      brandPartnerOfProfileIds: [],
      excludedProfileIds: [],
    });

    expect(sql).toContain(`p."visibility" = 'public'`);
    expect(sql).toContain(`p."authorProfileId" = :viewerProfileId`);
    expect(sql).toContain(`'followers'`);
    expect(sql).toContain(`'close_friends'`);
    expect(parameters.followingIds).toEqual(['anna']);
    expect(parameters.closeFriendIds).toEqual(['bo']);
    expect(parameters.brandPartnerIds).toBeUndefined();
  });

  it('suffixes parameter names so the predicate can be used twice in one query', () => {
    const { parameters } = visibilityPredicate(
      'p',
      { ...PUBLIC_SCOPE, viewerProfileId: 'me' },
      '_2',
    );
    expect(parameters).toHaveProperty('viewerProfileId_2', 'me');
  });
});
