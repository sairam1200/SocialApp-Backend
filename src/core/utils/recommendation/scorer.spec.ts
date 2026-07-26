import {
  DEFAULT_FEED_PREFERENCES,
  resolveFeedPreferences,
} from './ranking-weights';
import {
  CandidateFeatures,
  explain,
  predictEngagement,
  scoreCandidate,
} from './scorer';

const NOW = new Date('2026-07-26T12:00:00.000Z');

function features(
  overrides: Partial<CandidateFeatures> = {},
): CandidateFeatures {
  return {
    id: 'post-1',
    authorId: 'author-1',
    publishedOn: new Date(NOW.getTime() - 3_600_000),
    impressions: 1000,
    likes: 30,
    comments: 4,
    reposts: 2,
    shares: 3,
    clicks: 20,
    topicAffinity: 0.3,
    isFollowed: 0,
    authorAffinity: 0.2,
    authorQuality: 0.5,
    retrievalScore: 0.5,
    hasMedia: 0,
    isSponsored: 0,
    isDownranked: 0,
    ...overrides,
  };
}

describe('predictEngagement', () => {
  it('produces probabilities in (0, 1) for every objective', () => {
    const predictions = predictEngagement(features());
    for (const [key, value] of Object.entries(predictions)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
      expect(key).toBeTruthy();
    }
  });

  it('predicts more engagement from a follower than a stranger', () => {
    expect(predictEngagement(features({ isFollowed: 1 })).like).toBeGreaterThan(
      predictEngagement(features({ isFollowed: 0 })).like,
    );
  });

  it('predicts more engagement on a topic the reader cares about', () => {
    expect(
      predictEngagement(features({ topicAffinity: 0.9 })).comment,
    ).toBeGreaterThan(
      predictEngagement(features({ topicAffinity: 0 })).comment,
    );
  });

  it('does not let a tiny sample claim a perfect rate', () => {
    // 2 likes on 2 impressions is not a 100% like rate, and treating it as one
    // is how a brand-new post outranks everything.
    const tiny = predictEngagement(features({ impressions: 2, likes: 2 }));
    expect(tiny.like).toBeLessThan(0.9);
  });

  it('raises the negative prediction when the reader has downranked it', () => {
    expect(
      predictEngagement(features({ isDownranked: 1 })).negative,
    ).toBeGreaterThan(
      predictEngagement(features({ isDownranked: 0 })).negative,
    );
  });
});

describe('scoreCandidate', () => {
  const preferences = DEFAULT_FEED_PREFERENCES;

  it('ranks a fresh post above an identical old one', () => {
    const fresh = scoreCandidate(features(), preferences, NOW);
    const old = scoreCandidate(
      features({ publishedOn: new Date(NOW.getTime() - 30 * 86_400_000) }),
      preferences,
      NOW,
    );
    expect(fresh.score).toBeGreaterThan(old.score);
  });

  it('ranks a followed author above a stranger, all else equal', () => {
    expect(
      scoreCandidate(features({ isFollowed: 1 }), preferences, NOW).score,
    ).toBeGreaterThan(
      scoreCandidate(features({ isFollowed: 0 }), preferences, NOW).score,
    );
  });

  it('pushes a downranked candidate below an ordinary one', () => {
    expect(
      scoreCandidate(features({ isDownranked: 1 }), preferences, NOW).score,
    ).toBeLessThan(scoreCandidate(features(), preferences, NOW).score);
  });

  it('does not boost a sponsored post', () => {
    // Placement comes from `blendSponsored`, so paid reach is a fixed share of
    // the feed rather than something buyable.
    const paid = scoreCandidate(features({ isSponsored: 1 }), preferences, NOW);
    const organic = scoreCandidate(
      features({ isSponsored: 0 }),
      preferences,
      NOW,
    );
    expect(paid.score).toBeCloseTo(organic.score, 10);
  });

  it('gives new content an exploration bonus that fades with exposure', () => {
    const unseen = scoreCandidate(
      features({
        impressions: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
        shares: 0,
        clicks: 0,
      }),
      preferences,
      NOW,
    );
    expect(unseen.terms.exploration).toBeGreaterThan(0);

    const seen = scoreCandidate(
      features({ impressions: 100_000 }),
      preferences,
      NOW,
    );
    expect(seen.terms.exploration).toBeLessThan(unseen.terms.exploration);
  });

  it('honours a reader who turned exploration off', () => {
    const off = resolveFeedPreferences({ explorationStrength: 0 });
    expect(scoreCandidate(features(), off, NOW).terms.exploration).toBe(0);
  });

  it('honours a reader who turned the comment objective down', () => {
    const quiet = resolveFeedPreferences({
      objectives: { ...DEFAULT_FEED_PREFERENCES.objectives, comment: 0 },
    });
    expect(
      scoreCandidate(features({ comments: 500 }), quiet, NOW).score,
    ).toBeLessThan(
      scoreCandidate(features({ comments: 500 }), DEFAULT_FEED_PREFERENCES, NOW)
        .score,
    );
  });

  it('never produces NaN, whatever the inputs', () => {
    const hostile = scoreCandidate(
      features({
        impressions: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
        shares: 0,
        clicks: 0,
        topicAffinity: 0,
        authorQuality: 0,
        retrievalScore: 0,
      }),
      preferences,
      NOW,
    );
    expect(Number.isFinite(hostile.score)).toBe(true);
  });

  it('keeps recency from turning a negative score into a boost', () => {
    // The bug this guards: multiplying a negative utility by a decay factor
    // makes an *older* bad post score higher than a fresh one.
    const freshBad = scoreCandidate(
      features({ isDownranked: 1 }),
      preferences,
      NOW,
    );
    const oldBad = scoreCandidate(
      features({
        isDownranked: 1,
        publishedOn: new Date(NOW.getTime() - 60 * 86_400_000),
      }),
      preferences,
      NOW,
    );
    expect(oldBad.score).toBeLessThanOrEqual(freshBad.score);
  });
});

describe('explain', () => {
  it('names the strongest reasons, capped at three', () => {
    const reasons = explain(
      features({ isFollowed: 1, topicAffinity: 0.8, authorAffinity: 0.5 }),
      [
        { source: 'following', rank: 1 },
        { source: 'trending', rank: 9 },
      ],
    );
    expect(reasons).toContain('followed');
    expect(reasons.length).toBeLessThanOrEqual(3);
  });

  it('always leads with the sponsored label', () => {
    const reasons = explain(features({ isSponsored: 1, isFollowed: 1 }), []);
    expect(reasons[0]).toBe('sponsored');
  });

  it('falls back to the retrieval source when there is no affinity', () => {
    const reasons = explain(
      features({ isFollowed: 0, topicAffinity: 0, authorAffinity: 0 }),
      [{ source: 'trending', rank: 2 }],
    );
    expect(reasons).toEqual(['trending']);
  });
});

describe('resolveFeedPreferences', () => {
  it('returns the defaults for null', () => {
    expect(resolveFeedPreferences(null).recencyHalfLifeHours).toBe(
      DEFAULT_FEED_PREFERENCES.recencyHalfLifeHours,
    );
  });

  it('clamps a hostile half-life instead of letting it reach the ranker', () => {
    // A NaN here makes every score NaN and the feed silently empties.
    expect(
      resolveFeedPreferences({ recencyHalfLifeHours: Number.NaN })
        .recencyHalfLifeHours,
    ).toBe(DEFAULT_FEED_PREFERENCES.recencyHalfLifeHours);
    expect(
      resolveFeedPreferences({ recencyHalfLifeHours: 100_000 })
        .recencyHalfLifeHours,
    ).toBe(720);
    expect(
      resolveFeedPreferences({ recencyHalfLifeHours: -5 }).recencyHalfLifeHours,
    ).toBe(1);
  });

  it('clamps source weights into range and keeps unspecified ones', () => {
    const resolved = resolveFeedPreferences({
      sources: { following: 99 } as never,
    });
    expect(resolved.sources.following).toBe(2);
    expect(resolved.sources.trending).toBe(
      DEFAULT_FEED_PREFERENCES.sources.trending,
    );
  });

  it('lowercases and caps muted topics', () => {
    const resolved = resolveFeedPreferences({
      mutedTopics: ['Music', 'DESIGN'],
    });
    expect(resolved.mutedTopics).toEqual(['music', 'design']);
  });

  it('ignores a non-array mutedTopics rather than throwing', () => {
    expect(
      resolveFeedPreferences({ mutedTopics: 'music' as never }).mutedTopics,
    ).toEqual([]);
  });

  it('rounds integer-valued settings', () => {
    expect(
      resolveFeedPreferences({ maxPostsPerAuthor: 3.7 }).maxPostsPerAuthor,
    ).toBe(4);
  });
});
