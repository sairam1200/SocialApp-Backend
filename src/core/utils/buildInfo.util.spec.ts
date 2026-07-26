import { buildInfo, resolveCommit } from './buildInfo.util';

/**
 * The point of this endpoint is that it is trustworthy when everything else is
 * confusing, so the interesting cases are all the ones where it does *not*
 * know — it must say so rather than guess or throw.
 */
describe('resolveCommit', () => {
  it('prefers an explicitly supplied SHA', () => {
    expect(
      resolveCommit({ BUILD_SHA: 'abc1234', K_REVISION: 'svc-def5678' }),
    ).toBe('abc1234');
  });

  it('accepts the other names a build system might use', () => {
    expect(resolveCommit({ COMMIT_SHA: 'abc1234' })).toBe('abc1234');
    expect(resolveCommit({ SHORT_SHA: 'abc1234' })).toBe('abc1234');
  });

  it('truncates a full 40-character SHA', () => {
    const full = 'a'.repeat(40);
    expect(resolveCommit({ BUILD_SHA: full })).toHaveLength(12);
  });

  it('reads the SHA out of a Cloud Run revision name', () => {
    // `--revision-suffix=$SHORT_SHA` puts it there, so this works against the
    // existing deployment with no pipeline change.
    expect(resolveCommit({ K_REVISION: 'gaddr-backend-a1b2c3d' })).toBe(
      'a1b2c3d',
    );
  });

  it('handles a service name that itself contains hyphens', () => {
    expect(resolveCommit({ K_REVISION: 'my-long-service-name-9f8e7d6' })).toBe(
      '9f8e7d6',
    );
  });

  it('ignores a revision suffix that is not a hash', () => {
    // Cloud Run's own default suffix is `-00001-abc`, which is not a commit.
    expect(resolveCommit({ K_REVISION: 'gaddr-backend-00001-xyz' })).toBe(
      'unknown',
    );
  });

  it('falls back to the Vercel variable', () => {
    expect(resolveCommit({ VERCEL_GIT_COMMIT_SHA: 'f'.repeat(40) })).toBe(
      'f'.repeat(12),
    );
  });

  it('admits it does not know rather than guessing', () => {
    expect(resolveCommit({})).toBe('unknown');
  });
});

describe('buildInfo', () => {
  it('reports enough to identify the build without exposing anything', () => {
    const info = buildInfo({ BUILD_SHA: 'abc1234', NODE_ENV: 'production' });

    expect(info.commit).toBe('abc1234');
    expect(info.runtime).toBe(process.versions.node);
    expect(typeof info.uptimeSeconds).toBe('number');
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Date.parse(info.startedOn)).not.toBeNaN();
  });

  it('never throws, whatever the environment', () => {
    expect(() => buildInfo({})).not.toThrow();
    expect(buildInfo({}).commit).toBe('unknown');
  });

  it('carries no keys beyond the documented shape', () => {
    // A version endpoint that grows fields by accident becomes an information
    // leak. The shape is the contract.
    expect(Object.keys(buildInfo({ BUILD_SHA: 'a' })).sort()).toEqual([
      'commit',
      'environment',
      'revision',
      'runtime',
      'startedOn',
      'uptimeSeconds',
    ]);
  });
});
