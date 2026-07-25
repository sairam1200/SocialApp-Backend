import { ContentStream } from '../../domain/entities/contentStream.entity';
import { AggregatedSearchResult, __testables } from './database-search.handler';

const {
  toAggregatedResult,
  buildSourceUrl,
  extractThumbnail,
  extractCreator,
  extractLicense,
} = __testables;

/**
 * Tests for the aggregated cross-platform search projection.
 *
 * Context: `POST /search` fans out to twelve platforms and persists every result
 * into `contentStreams`, but `GET /search/results` — the endpoint the UI calls —
 * previously read only native Gaddr tables. Aggregated content was therefore saved
 * and never shown. Verified against a live YouTube search: 11 rows written,
 * `GET /search/results` returned an empty set.
 *
 * These tests cover the projection that closes that gap. The URL builder is the
 * part most likely to break silently — a wrong URL still renders a result card, it
 * just sends the user to a 404.
 */

function stream(overrides: Partial<ContentStream> = {}): ContentStream {
  return {
    id: 'cs-1',
    platform: 'youtube',
    type: 'Content',
    subType: 'video',
    title: 'A video',
    externalId: 'abc123',
    metaData: {},
    lastRefreshed: new Date('2026-07-25T12:00:00Z'),
    ...overrides,
  } as unknown as ContentStream;
}

describe('buildSourceUrl', () => {
  it('builds a YouTube watch URL for a video', () => {
    expect(buildSourceUrl('youtube', 'video', 'dQw4w9WgXcQ', null)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('builds a channel URL, not a watch URL, for a channel', () => {
    // The distinction matters: a channel id in a watch URL is a dead link, and
    // channels are a large share of YouTube search results.
    expect(
      buildSourceUrl('youtube', 'channel', 'UCA_fIuIBkjjO5IfK50Iqs7w', null),
    ).toBe('https://www.youtube.com/channel/UCA_fIuIBkjjO5IfK50Iqs7w');
  });

  it('builds a playlist URL for a playlist', () => {
    expect(buildSourceUrl('youtube', 'playlist', 'PLYfCBK8Ipl', null)).toBe(
      'https://www.youtube.com/playlist?list=PLYfCBK8Ipl',
    );
  });

  it('defaults an unknown YouTube subType to a watch URL', () => {
    expect(buildSourceUrl('youtube', null, 'abc123', null)).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  it('handles the other implemented platforms', () => {
    expect(buildSourceUrl('pinterest', 'pin', '99', null)).toBe(
      'https://www.pinterest.com/pin/99',
    );
    expect(buildSourceUrl('spotify', 'album', 'xyz', null)).toBe(
      'https://open.spotify.com/album/xyz',
    );
    expect(buildSourceUrl('twitter', null, '1234', null)).toBe(
      'https://x.com/i/status/1234',
    );
  });

  it('prefers an explicit permalink from the platform payload', () => {
    // Reddit and Facebook return real permalinks; a constructed URL would be worse.
    expect(
      buildSourceUrl('reddit', null, 'r/x/comments/1', {
        permalink: 'https://www.reddit.com/r/design/comments/abc/title/',
      }),
    ).toBe('https://www.reddit.com/r/design/comments/abc/title/');
  });

  it('ignores a non-http permalink and falls back to construction', () => {
    // Some payloads carry a relative permalink, which would produce a broken link.
    expect(
      buildSourceUrl('youtube', 'video', 'abc123', { permalink: '/watch/abc' }),
    ).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('returns null rather than a malformed URL when the external id is missing', () => {
    expect(buildSourceUrl('youtube', 'video', '', null)).toBeNull();
  });

  it('uses the stored externalUrl for GitHub, whose ids are not addressable', () => {
    // GitHub search returns numeric ids; there is no URL you can build from one. The
    // repository/user html_url is persisted into metaData.externalUrl instead.
    expect(
      buildSourceUrl('github', 'repository', '12345', {
        externalUrl: 'https://github.com/donnemartin/system-design-primer',
      }),
    ).toBe('https://github.com/donnemartin/system-design-primer');

    // Without it, null rather than a fabricated path.
    expect(buildSourceUrl('github', 'repository', '12345', null)).toBeNull();
  });

  it('returns null for a platform with no known URL shape', () => {
    // Better an absent link than a guessed one that 404s.
    expect(buildSourceUrl('behance', null, 'abc', null)).toBeNull();
  });
});

describe('extractThumbnail', () => {
  it('prefers the highest-resolution YouTube thumbnail available', () => {
    expect(
      extractThumbnail({
        thumbnails: {
          default: { url: 'http://d/default.jpg' },
          medium: { url: 'http://d/medium.jpg' },
          high: { url: 'http://d/high.jpg' },
        },
      }),
    ).toBe('http://d/high.jpg');
  });

  it('falls back through the resolution ladder', () => {
    expect(
      extractThumbnail({ thumbnails: { medium: { url: 'http://d/m.jpg' } } }),
    ).toBe('http://d/m.jpg');
  });

  it('reads the differing keys other platforms use', () => {
    expect(extractThumbnail({ thumbnail_url: 'http://d/a.jpg' })).toBe(
      'http://d/a.jpg',
    );
    expect(extractThumbnail({ media_url: 'http://d/b.jpg' })).toBe(
      'http://d/b.jpg',
    );
    expect(extractThumbnail({ images: [{ url: 'http://d/c.jpg' }] })).toBe(
      'http://d/c.jpg',
    );
    expect(
      extractThumbnail({ picture: { data: { url: 'http://d/d.jpg' } } }),
    ).toBe('http://d/d.jpg');
  });

  it('returns null for absent, empty or unrecognised metadata', () => {
    expect(extractThumbnail(null)).toBeNull();
    expect(extractThumbnail({})).toBeNull();
    expect(extractThumbnail({ thumbnails: {} })).toBeNull();
    expect(extractThumbnail({ thumbnail_url: '' })).toBeNull();
  });

  it('does not throw on a deeply malformed payload', () => {
    // metaData is whatever the platform returned; it must never crash the response.
    expect(() =>
      extractThumbnail({ thumbnails: null, images: 'not-an-array' } as never),
    ).not.toThrow();
  });
});

describe('toAggregatedResult', () => {
  it('projects a YouTube video row into the client shape', () => {
    const result: AggregatedSearchResult = toAggregatedResult(
      stream({
        externalId: 'z29sBtkD9Ww',
        title: 'TUSUK KONDE PART 4',
        metaData: {
          description: 'A description',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/z29sBtkD9Ww/hq.jpg' },
          },
        },
      } as Partial<ContentStream>),
    );

    expect(result).toMatchObject({
      platform: 'youtube',
      type: 'Content',
      subType: 'video',
      title: 'TUSUK KONDE PART 4',
      description: 'A description',
      thumbnailUrl: 'https://i.ytimg.com/vi/z29sBtkD9Ww/hq.jpg',
      url: 'https://www.youtube.com/watch?v=z29sBtkD9Ww',
      externalId: 'z29sBtkD9Ww',
    });
  });

  it('normalises the differing body-text field per platform', () => {
    // YouTube: description, Facebook: message, Instagram: caption, Reddit: selftext.
    expect(
      toAggregatedResult(stream({ metaData: { message: 'fb text' } } as never))
        .description,
    ).toBe('fb text');
    expect(
      toAggregatedResult(stream({ metaData: { caption: 'ig text' } } as never))
        .description,
    ).toBe('ig text');
    expect(
      toAggregatedResult(
        stream({ metaData: { selftext: 'reddit text' } } as never),
      ).description,
    ).toBe('reddit text');
  });

  it('does not leak raw metaData into the response', () => {
    // The API contract must not depend on twelve third-party payload shapes.
    const result = toAggregatedResult(
      stream({
        metaData: { secretInternalField: 'should not surface' },
      } as never),
    );

    expect(JSON.stringify(result)).not.toContain('secretInternalField');
    expect(Object.keys(result).sort()).toEqual(
      [
        'description',
        'externalId',
        'id',
        'lastRefreshed',
        'creator',
        'license',
        'platform',
        'subType',
        'thumbnailUrl',
        'title',
        'type',
        'url',
      ].sort(),
    );
  });

  it('tolerates null metaData and a missing title', () => {
    const result = toAggregatedResult(
      stream({ metaData: null, title: null } as never),
    );

    expect(result.title).toBe('');
    expect(result.description).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
  });

  it('keeps lastRefreshed so staleness is visible to the client', () => {
    const result = toAggregatedResult(stream());
    expect(result.lastRefreshed).toEqual(new Date('2026-07-25T12:00:00Z'));
  });
});

/**
 * Attribution and licence.
 *
 * These reach the client because Openverse's value is media a user can *prove* they may
 * reuse. A licence that lands in the database and stops there is worth nothing — an image
 * rendered without its attribution is a licence breach, so this is compliance, not
 * decoration.
 */
describe('extractCreator', () => {
  it('reads the field each platform actually persists', () => {
    // Verified against real rows in contentStreams, not against the upstream API shapes.
    // The mappers rename things: GitHub flattens owner.login to a plain string, and the
    // Apple mapper writes `artist`. Reading owner.login alone returned null for every
    // GitHub row.
    expect(extractCreator({ creator: 'Jonas Bergman' })).toBe('Jonas Bergman'); // openverse
    expect(extractCreator({ author: 'fellowshipofone' })).toBe(
      'fellowshipofone',
    ); // hackernews
    expect(extractCreator({ channelTitle: 'Kanal 5' })).toBe('Kanal 5'); // youtube
    expect(extractCreator({ owner: 'alvarorgaz' })).toBe('alvarorgaz'); // github, flattened
    expect(extractCreator({ artist: 'Mikael Askergren' })).toBe(
      'Mikael Askergren',
    ); // apple
  });

  it('still reads a nested owner, so re-nesting the GitHub mapper cannot regress it', () => {
    expect(extractCreator({ owner: { login: 'octocat' } })).toBe('octocat');
  });

  it('trims, because a padded name breaks layout rather than logic', () => {
    expect(extractCreator({ creator: '  Ada Lovelace \n' })).toBe(
      'Ada Lovelace',
    );
  });

  it('returns null rather than an empty or non-string name', () => {
    // A blank creator must not render as an empty "by " prefix.
    expect(extractCreator({ creator: '   ' })).toBeNull();
    expect(extractCreator({ creator: 12345 } as never)).toBeNull();
    expect(extractCreator(null)).toBeNull();
    expect(extractCreator({})).toBeNull();
  });
});

describe('extractLicense', () => {
  it('carries code, version and deed URL through from Openverse', () => {
    expect(
      extractLicense({
        license: 'by-sa',
        licenseVersion: '4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      }),
    ).toEqual({
      code: 'by-sa',
      version: '4.0',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  });

  it('normalises the code so a badge lookup does not miss on case', () => {
    expect(extractLicense({ license: 'CC0' })?.code).toBe('cc0');
  });

  it('surfaces a code with no version, because attribution is still required', () => {
    // 'by' alone already tells the user they must attribute. Withholding the badge until
    // a version arrives would hide the obligation.
    expect(extractLicense({ license: 'by' })).toEqual({
      code: 'by',
      version: null,
      url: null,
    });
  });

  it('returns null when the source states no terms', () => {
    // Absent terms are NOT permissive terms. Every platform except Openverse lands here,
    // and the UI must show nothing rather than imply reuse is allowed.
    expect(extractLicense({ description: 'A cat' })).toBeNull();
    expect(extractLicense({ license: '' })).toBeNull();
    expect(extractLicense({ license: '  ' })).toBeNull();
    expect(extractLicense(null)).toBeNull();
  });

  it('rejects a non-string code instead of rendering "undefined"', () => {
    expect(extractLicense({ license: { id: 4 } } as never)).toBeNull();
    expect(extractLicense({ license: 7 } as never)).toBeNull();
  });
});
