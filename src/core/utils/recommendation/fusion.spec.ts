import { blendSponsored, diversify, reciprocalRankFusion } from './fusion';
import { toSparseVector } from './ranking-math';

describe('reciprocalRankFusion', () => {
  it('ranks an item retrieved by several sources above one retrieved by one', () => {
    const fused = reciprocalRankFusion([
      { source: 'following', ids: ['a', 'b', 'c'] },
      { source: 'trending', ids: ['c', 'a', 'd'] },
    ]);
    // `a` is 1st and 2nd; `c` is 3rd and 1st. Both beat the singletons.
    expect(fused[0].id).toBe('a');
    expect(fused.map((f) => f.id)).toContain('c');
    expect(fused.find((f) => f.id === 'b')!.score).toBeLessThan(
      fused.find((f) => f.id === 'a')!.score,
    );
  });

  it('records which sources contributed, for the "why am I seeing this" sheet', () => {
    const fused = reciprocalRankFusion([
      { source: 'following', ids: ['a'] },
      { source: 'topic-match', ids: ['a'] },
    ]);
    expect(fused[0].contributions.map((c) => c.source).sort()).toEqual([
      'following',
      'topic-match',
    ]);
  });

  it('respects source weights', () => {
    const trusted = reciprocalRankFusion([
      { source: 'weak', ids: ['x'], weight: 0.1 },
      { source: 'strong', ids: ['y'], weight: 2 },
    ]);
    expect(trusted[0].id).toBe('y');
  });

  it('skips a source with weight 0 entirely', () => {
    // This is how the reader's algorithm controls are implemented: setting a
    // source to 0 must remove it, not merely down-weight it.
    const fused = reciprocalRankFusion([
      { source: 'off', ids: ['x'], weight: 0 },
      { source: 'on', ids: ['y'], weight: 1 },
    ]);
    expect(fused.map((f) => f.id)).toEqual(['y']);
  });

  it('is deterministic for tied scores', () => {
    const lists = [
      { source: 'a', ids: ['p', 'q'] },
      { source: 'b', ids: ['q', 'p'] },
    ];
    // A feed that reshuffles on every refresh reads as broken.
    expect(reciprocalRankFusion(lists).map((f) => f.id)).toEqual(
      reciprocalRankFusion(lists).map((f) => f.id),
    );
  });

  it('returns an empty list when every source is empty', () => {
    expect(reciprocalRankFusion([{ source: 'a', ids: [] }])).toEqual([]);
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});

describe('diversify', () => {
  const item = (
    id: string,
    score: number,
    topics: string[],
    group: string,
  ) => ({
    id,
    score,
    vector: toSparseVector(topics),
    groupId: group,
  });

  it('caps how many items one author can contribute', () => {
    const items = [
      item('1', 1.0, ['music'], 'anna'),
      item('2', 0.9, ['music'], 'anna'),
      item('3', 0.8, ['music'], 'anna'),
      item('4', 0.1, ['music'], 'bo'),
    ];
    const result = diversify(items, { limit: 4, maxPerGroup: 2, lambda: 1 });
    expect(result.filter((r) => r.groupId === 'anna')).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain('4');
  });

  it('breaks up runs of near-identical items when lambda is low', () => {
    const items = [
      item('1', 1.0, ['music', 'guitar'], 'a'),
      item('2', 0.99, ['music', 'guitar'], 'b'),
      item('3', 0.5, ['baking'], 'c'),
    ];
    const varied = diversify(items, { limit: 2, lambda: 0.1 });
    expect(varied.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('is pure relevance at lambda 1', () => {
    const items = [
      item('1', 1.0, ['music'], 'a'),
      item('2', 0.99, ['music'], 'b'),
      item('3', 0.5, ['baking'], 'c'),
    ];
    expect(diversify(items, { limit: 2, lambda: 1 }).map((r) => r.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('stops when every remaining candidate is blocked by the cap', () => {
    const items = [
      item('1', 1.0, ['music'], 'anna'),
      item('2', 0.9, ['music'], 'anna'),
    ];
    // Must terminate rather than loop forever looking for an eligible item.
    expect(diversify(items, { limit: 5, maxPerGroup: 1 })).toHaveLength(1);
  });

  it('handles items with no vector', () => {
    const result = diversify(
      [
        { id: '1', score: 1 },
        { id: '2', score: 0.5 },
      ],
      { limit: 2, lambda: 0.5 },
    );
    expect(result.map((r) => r.id)).toEqual(['1', '2']);
  });
});

describe('blendSponsored', () => {
  const organic = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10'];

  it('inserts paid items at a fixed cadence, not by score', () => {
    const blended = blendSponsored(organic, ['ad1', 'ad2'], 6, 3);
    expect(blended).toContain('ad1');
    // Never first: an advertiser cannot buy the top of the feed.
    expect(blended[0]).toBe('o1');
  });

  it('returns organic unchanged when there is nothing sponsored', () => {
    expect(blendSponsored(organic, [], 6)).toEqual(organic);
  });

  it('treats a cadence of 0 as "no ads"', () => {
    // `sponsoredEveryN: 0` is the reader turning paid content off entirely.
    expect(blendSponsored(organic, ['ad1'], 0)).toEqual(organic);
  });

  it('never places more sponsored items than it was given', () => {
    const blended = blendSponsored(organic, ['ad1'], 2);
    expect(blended.filter((x) => x === 'ad1')).toHaveLength(1);
  });

  it('does not mutate its inputs', () => {
    const ads = ['ad1'];
    const copy = [...organic];
    blendSponsored(organic, ads, 3);
    expect(organic).toEqual(copy);
    expect(ads).toEqual(['ad1']);
  });
});
