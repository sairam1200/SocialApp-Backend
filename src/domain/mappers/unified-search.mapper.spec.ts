import {
  SearchResultKind,
  SearchSourcePlatform,
  describeSource,
  toSourcePlatform,
} from '../contracts/unified-search.model';
import { Post, SocialProfile } from '../entities/social';
import { PostKind, PostStatus, Visibility } from '../enums';
import {
  detectPlayback,
  mapCommunityPost,
  mapExternalJob,
  mapProject,
  toMinorUnits,
} from './unified-search.mapper';

describe('toSourcePlatform', () => {
  it('recognises our own two products', () => {
    expect(toSourcePlatform('gaddr')).toBe(SearchSourcePlatform.Gaddr);
    expect(toSourcePlatform('gaddr-jobs')).toBe(SearchSourcePlatform.GaddrJobs);
  });

  it('is case- and separator-insensitive', () => {
    // `contentStreams.platform` was written by a dozen importers over several
    // years and does not agree on casing.
    expect(toSourcePlatform('YouTube')).toBe(SearchSourcePlatform.YouTube);
    expect(toSourcePlatform('HACKER_NEWS')).toBe(
      SearchSourcePlatform.HackerNews,
    );
    expect(toSourcePlatform('hacker news')).toBe(
      SearchSourcePlatform.HackerNews,
    );
  });

  it('follows the aliases platforms actually renamed themselves to', () => {
    expect(toSourcePlatform('twitter')).toBe(SearchSourcePlatform.X);
    expect(toSourcePlatform('itunes')).toBe(SearchSourcePlatform.Apple);
  });

  it('falls back to Other rather than dropping the result', () => {
    // A vague badge beats a missing result.
    expect(toSourcePlatform('some-new-network')).toBe(
      SearchSourcePlatform.Other,
    );
    expect(toSourcePlatform(null)).toBe(SearchSourcePlatform.Other);
    expect(toSourcePlatform('')).toBe(SearchSourcePlatform.Other);
  });
});

describe('describeSource', () => {
  it('marks our own products as native', () => {
    const gaddr = describeSource(SearchSourcePlatform.Gaddr);
    expect(gaddr.isNative).toBe(true);
    expect(gaddr.label).toBe('Gaddr');
    // Community content lives here, so there is no external URL to pass.
    expect(gaddr.externalUrl).toBeNull();
  });

  it('does not strip an external URL just because the source is ours', () => {
    // A job aggregated by Gaddr Jobs is ours *and* hosted elsewhere. Deriving
    // externalUrl from isNative dropped the application link.
    const job = describeSource(
      SearchSourcePlatform.GaddrJobs,
      'https://boards.test/jobs/7',
    );
    expect(job.isNative).toBe(true);
    expect(job.externalUrl).toBe('https://boards.test/jobs/7');
  });

  it('keeps the external URL for everyone else', () => {
    const yt = describeSource(
      SearchSourcePlatform.YouTube,
      'https://yt.test/1',
    );
    expect(yt.isNative).toBe(false);
    expect(yt.externalUrl).toBe('https://yt.test/1');
  });

  it('treats Gaddr Jobs as ours', () => {
    expect(describeSource(SearchSourcePlatform.GaddrJobs).isNative).toBe(true);
  });
});

describe('detectPlayback', () => {
  it('recognises media files by extension', () => {
    expect(detectPlayback('https://x.test/a.m3u8')?.kind).toBe('hls');
    expect(detectPlayback('https://x.test/a.mp4')?.kind).toBe('video');
    expect(detectPlayback('https://x.test/a.mp3')?.kind).toBe('audio');
    expect(detectPlayback('https://x.test/a.jpg')?.kind).toBe('image');
  });

  it('ignores the query string when matching', () => {
    expect(detectPlayback('https://x.test/a.mp4?token=abc')?.kind).toBe(
      'video',
    );
  });

  it('refuses a watch page', () => {
    // A page URL in a <video> is a broken player, which is worse than an
    // honest "open on YouTube" link.
    expect(detectPlayback('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(detectPlayback('https://example.com/some/article')).toBeNull();
  });

  it('handles absent input', () => {
    expect(detectPlayback(null)).toBeNull();
    expect(detectPlayback(undefined)).toBeNull();
  });
});

describe('toMinorUnits', () => {
  it('converts a decimal string without going through a float', () => {
    expect(toMinorUnits('1500.00')).toBe('150000');
    expect(toMinorUnits('19.99')).toBe('1999');
    expect(toMinorUnits('7')).toBe('700');
  });

  it('pads a single decimal place', () => {
    expect(toMinorUnits('19.9')).toBe('1990');
  });

  it('survives currency noise and blanks', () => {
    expect(toMinorUnits('$1,200.50')).toBe('120050');
    expect(toMinorUnits('')).toBe('0');
  });

  it('keeps precision a float would lose', () => {
    // 2^53 is ~9.007e15; this is beyond what Number can represent exactly.
    expect(toMinorUnits('90071992547409.91')).toBe('9007199254740991');
  });
});

describe('mapCommunityPost', () => {
  const author = new SocialProfile({
    id: 'p1',
    handle: 'anna',
    displayName: 'Anna Andersson',
    isVerified: true,
  });

  function post(overrides: Partial<Post> = {}): Post {
    return new Post({
      id: 'post-1',
      authorProfileId: 'p1',
      kind: PostKind.Update,
      status: PostStatus.Published,
      visibility: Visibility.Public,
      body: 'First line of the post\nand a second line',
      topics: ['design'],
      tags: [],
      mentionedProfileIds: [],
      likesCount: 5,
      commentsCount: 2,
      impressionsCount: 100,
      publishedOn: new Date('2026-07-20T10:00:00Z'),
      createdOn: new Date('2026-07-20T10:00:00Z'),
      ...overrides,
    });
  }

  it('marks our own posts as native, with no external URL', () => {
    const item = mapCommunityPost(post(), author, []);
    expect(item.source.platform).toBe(SearchSourcePlatform.Gaddr);
    expect(item.source.isNative).toBe(true);
    expect(item.source.externalUrl).toBeNull();
  });

  it('uses the first line as a title, since a post has none', () => {
    const item = mapCommunityPost(post(), author, []);
    expect(item.title).toBe('First line of the post');
  });

  it('falls back to the author when there is no body', () => {
    const item = mapCommunityPost(post({ body: undefined }), author, []);
    expect(item.title).toContain('Anna Andersson');
  });

  it('links to the post on Gaddr, not off-site', () => {
    const item = mapCommunityPost(post(), author, []);
    expect(item.url).toBe('/community/anna/post-1');
  });

  it('makes attached video playable in place', () => {
    const item = mapCommunityPost(post(), author, [
      {
        url: 'https://cdn.test/clip.mp4',
        kind: 'video',
        thumbnailUrl: 'https://cdn.test/t.jpg',
      },
    ]);
    expect(item.playback?.kind).toBe('video');
    expect(item.kind).toBe(SearchResultKind.Video);
  });

  it('classifies a photo post as an image', () => {
    const item = mapCommunityPost(post({ kind: PostKind.Photo }), author, [
      { url: 'https://cdn.test/a.jpg', kind: 'image' },
    ]);
    expect(item.kind).toBe(SearchResultKind.Image);
  });

  it('survives a deleted author', () => {
    // A cached page can outlive its author. Rendering something beats throwing.
    expect(() => mapCommunityPost(post(), undefined, [])).not.toThrow();
  });
});

describe('Gaddr Jobs mapping', () => {
  it('badges a project as Gaddr Jobs and keeps money in minor units', () => {
    const item = mapProject({
      id: 42,
      title: 'Build a design system',
      description: 'Long description',
      budget: '5000.00',
      currency: 'EUR',
      skills: ['figma', 'react'],
      createdAt: new Date('2026-07-01T00:00:00Z'),
    } as never);

    expect(item.source.platform).toBe(SearchSourcePlatform.GaddrJobs);
    expect(item.source.isNative).toBe(true);
    expect(item.kind).toBe(SearchResultKind.Project);
    expect(item.metrics?.priceMinor).toBe('500000');
    expect(item.metrics?.currency).toBe('EUR');
    expect(item.topics).toEqual(['figma', 'react']);
  });

  it('keeps the original listing URL on an aggregated job', () => {
    // Gaddr Jobs surfaces it; someone else hosts it. The reader has to be able
    // to reach the actual application.
    const item = mapExternalJob({
      id: 7,
      title: 'Senior Engineer',
      company: 'Acme',
      location: 'Stockholm',
      description: 'Work on things',
      url: 'https://boards.test/jobs/7',
      postedAt: new Date('2026-07-10T00:00:00Z'),
      createdAt: new Date('2026-07-10T00:00:00Z'),
    } as never);

    expect(item.kind).toBe(SearchResultKind.Job);
    expect(item.source.externalUrl).toBe('https://boards.test/jobs/7');
    expect(item.description).toContain('Acme');
    expect(item.description).toContain('Stockholm');
  });
});
