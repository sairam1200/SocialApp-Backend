import limitAllocatorUtil from './limitAllocator.util';
import type { SectionSkipMap } from './limitAllocator.util';

/**
 * The limit allocator decides how a caller's requested result count is divided
 * across the four search sections (aggregated platform content, native Gaddr
 * content, linked accounts, manual profiles).
 *
 * It runs on every platform search — twelve times per global query — so an
 * off-by-one here either silently drops results the user paid an API call for, or
 * over-fetches and inflates third-party quota usage.
 */

function skips(overrides: Partial<SectionSkipMap> = {}): SectionSkipMap {
  return {
    contentStream: false,
    userContent: false,
    linkedAccount: false,
    manualProfile: false,
    ...overrides,
  };
}

const SECTIONS = [
  'contentStream',
  'userContent',
  'linkedAccount',
  'manualProfile',
] as const;

function total(limits: Record<string, number>): number {
  return SECTIONS.reduce((sum, key) => sum + limits[key], 0);
}

describe('limitAllocatorUtil.getSectionLimits', () => {
  it('splits a divisible limit evenly across all four sections', () => {
    expect(limitAllocatorUtil.getSectionLimits(20, skips())).toEqual({
      contentStream: 5,
      userContent: 5,
      linkedAccount: 5,
      manualProfile: 5,
    });
  });

  it('never loses or invents results when the limit is not divisible', () => {
    // The remainder must be distributed, not discarded — otherwise a request for
    // 25 results silently returns 24.
    for (const limit of [1, 2, 3, 5, 7, 11, 25, 26, 27, 99, 100]) {
      expect(total(limitAllocatorUtil.getSectionLimits(limit, skips()))).toBe(
        limit,
      );
    }
  });

  it('distributes the remainder to the earliest sections', () => {
    // 25 / 4 = 6 remainder 1 -> the first section takes the extra slot.
    expect(limitAllocatorUtil.getSectionLimits(25, skips())).toEqual({
      contentStream: 7,
      userContent: 6,
      linkedAccount: 6,
      manualProfile: 6,
    });
  });

  it('gives the whole limit to the only active section', () => {
    const limits = limitAllocatorUtil.getSectionLimits(
      30,
      skips({ userContent: true, linkedAccount: true, manualProfile: true }),
    );

    expect(limits).toEqual({
      contentStream: 30,
      userContent: 0,
      linkedAccount: 0,
      manualProfile: 0,
    });
  });

  it('redistributes across the remaining sections when some are skipped', () => {
    const limits = limitAllocatorUtil.getSectionLimits(
      10,
      skips({ linkedAccount: true, manualProfile: true }),
    );

    expect(limits).toEqual({
      contentStream: 5,
      userContent: 5,
      linkedAccount: 0,
      manualProfile: 0,
    });
    expect(total(limits)).toBe(10);
  });

  it('assigns zero to every skipped section', () => {
    const limits = limitAllocatorUtil.getSectionLimits(
      12,
      skips({ userContent: true }),
    );

    expect(limits.userContent).toBe(0);
    expect(total(limits)).toBe(12);
  });

  it('conserves the total for every possible skip combination', () => {
    // Exhaustive over the 15 combinations that leave at least one section active.
    const flags = [false, true];
    let checked = 0;

    for (const cs of flags)
      for (const uc of flags)
        for (const la of flags)
          for (const mp of flags) {
            const skipMap = skips({
              contentStream: cs,
              userContent: uc,
              linkedAccount: la,
              manualProfile: mp,
            });
            const activeCount = [cs, uc, la, mp].filter((s) => !s).length;
            if (activeCount === 0) continue;

            const limits = limitAllocatorUtil.getSectionLimits(17, skipMap);
            expect(total(limits)).toBe(17);

            // Skipped sections must stay at zero.
            if (cs) expect(limits.contentStream).toBe(0);
            if (uc) expect(limits.userContent).toBe(0);
            if (la) expect(limits.linkedAccount).toBe(0);
            if (mp) expect(limits.manualProfile).toBe(0);

            checked += 1;
          }

    expect(checked).toBe(15);
  });

  it('produces no negative or fractional allocations', () => {
    const limits = limitAllocatorUtil.getSectionLimits(7, skips());

    for (const key of SECTIONS) {
      expect(Number.isInteger(limits[key])).toBe(true);
      expect(limits[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns all zeros for a zero limit rather than throwing', () => {
    expect(limitAllocatorUtil.getSectionLimits(0, skips())).toEqual({
      contentStream: 0,
      userContent: 0,
      linkedAccount: 0,
      manualProfile: 0,
    });
  });

  it('returns all zeros when every section is skipped', () => {
    // Guards the division-by-zero path: activeCount is 0, so baseLimit is
    // Infinity and remainder NaN. Those values must never reach the output.
    const limits = limitAllocatorUtil.getSectionLimits(
      10,
      skips({
        contentStream: true,
        userContent: true,
        linkedAccount: true,
        manualProfile: true,
      }),
    );

    expect(limits).toEqual({
      contentStream: 0,
      userContent: 0,
      linkedAccount: 0,
      manualProfile: 0,
    });

    for (const key of SECTIONS) {
      expect(Number.isFinite(limits[key])).toBe(true);
      expect(Number.isNaN(limits[key])).toBe(false);
    }
  });
});
