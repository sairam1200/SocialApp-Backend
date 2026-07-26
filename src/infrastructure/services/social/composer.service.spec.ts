import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Post, SocialProfile } from '../../../domain/entities/social';
import {
  DisclosureKind,
  PostKind,
  PostStatus,
  Visibility,
} from '../../../domain/enums';
import { ComposerService } from './composer.service';

/**
 * Stubs rather than mocks: the assertions are about what the composer *wrote*,
 * so the fakes record and return, and nothing verifies call counts. A test
 * that asserts "the repository was called once" breaks on every refactor and
 * proves nothing about behaviour.
 */
function makeHarness(profileOverrides: Partial<SocialProfile> = {}) {
  const saved: Post[] = [];
  const media: Record<string, unknown[]> = {};
  const pollOptions: Record<string, unknown[]> = {};
  const productTags: Record<string, unknown[]> = {};
  const byId = new Map<string, Post>();

  const author = new SocialProfile({
    id: 'profile-1',
    userId: 'user-1',
    handle: 'anna',
    displayName: 'Anna',
    topics: [],
    defaultPostVisibility: Visibility.Public,
    ...profileOverrides,
  });

  const posts = {
    getByIdAsync: jest.fn(async (id: string) => byId.get(id) ?? null),
    getManyByIdsAsync: jest.fn(async () => []),
    createAsync: jest.fn(async (post: Post) => {
      post.id = post.id || `post-${saved.length + 1}`;
      post.createdOn = post.createdOn ?? new Date();
      saved.push(post);
      byId.set(post.id, post);
      return post;
    }),
    updateAsync: jest.fn(async (id: string, changes: Partial<Post>) => {
      const post = byId.get(id);
      if (!post) return null;
      Object.assign(post, changes);
      return post;
    }),
    deleteAsync: jest.fn(async (id: string) => {
      byId.delete(id);
    }),
    replaceMediaAsync: jest.fn(async (postId: string, items: unknown[]) => {
      media[postId] = items;
      return items;
    }),
    replacePollOptionsAsync: jest.fn(
      async (postId: string, items: unknown[]) => {
        pollOptions[postId] = items;
        return items;
      },
    ),
    replaceProductTagsAsync: jest.fn(
      async (postId: string, items: unknown[]) => {
        productTags[postId] = items;
        return items;
      },
    ),
    incrementCountersAsync: jest.fn(async () => undefined),
    getScheduledDueAsync: jest.fn(async () => []),
  } as never;

  const profiles = {
    getByUserIdAsync: jest.fn(async (userId: string) =>
      userId === 'user-1' ? author : null,
    ),
    getByIdAsync: jest.fn(async () => author),
    getByHandleAsync: jest.fn(async (handle: string) =>
      handle === 'bo'
        ? new SocialProfile({ id: 'profile-2', handle: 'bo' })
        : null,
    ),
    incrementCountersAsync: jest.fn(async () => undefined),
  } as never;

  const topics = {
    getAllAsync: jest.fn(async () => [
      { name: 'Music', isActive: true },
      { name: 'Machine Learning', isActive: true },
    ]),
  } as never;

  const emitter = new EventEmitter2();
  const service = new ComposerService(posts, profiles, topics, emitter);

  return {
    service,
    posts,
    profiles,
    saved,
    media,
    pollOptions,
    productTags,
    byId,
    author,
    emitter,
  };
}

describe('ComposerService', () => {
  it('publishes an update and stamps publishedOn', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Hello Community',
      publish: true,
    });

    expect(post.status).toBe(PostStatus.Published);
    expect(post.publishedOn).toBeInstanceOf(Date);
    expect(post.authorProfileId).toBe('profile-1');
  });

  it('saves a draft when publish is false', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Not yet',
      publish: false,
    });

    expect(post.status).toBe(PostStatus.Draft);
    expect(post.publishedOn).toBeNull();
  });

  it('schedules a future post rather than publishing it', async () => {
    const h = makeHarness();
    const when = new Date(Date.now() + 3_600_000);
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Later',
      publish: true,
      scheduledFor: when,
    });

    expect(post.status).toBe(PostStatus.Scheduled);
    expect(post.scheduledFor).toEqual(when);
    expect(post.publishedOn).toBeNull();
  });

  it('refuses a schedule in the past', async () => {
    const h = makeHarness();
    await expect(
      h.service.composeAsync({
        authorUserId: 'user-1',
        kind: PostKind.Update,
        body: 'Time travel',
        publish: true,
        scheduledFor: new Date(Date.now() - 1000),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an empty post', async () => {
    const h = makeHarness();
    await expect(
      h.service.composeAsync({ authorUserId: 'user-1', kind: PostKind.Update }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a sponsored post with no disclosure', async () => {
    // Undisclosed advertising is the one thing the composer refuses outright.
    const h = makeHarness();
    await expect(
      h.service.composeAsync({
        authorUserId: 'user-1',
        kind: PostKind.Update,
        body: 'Love this product',
        isSponsored: true,
        disclosure: DisclosureKind.None,
        publish: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('defaults a sponsored post to a paid-partnership label', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Love this product',
      isSponsored: true,
      publish: true,
    });
    expect(post.disclosure).toBe(DisclosureKind.PaidPartnership);
  });

  it('requires at least two options for a poll', async () => {
    const h = makeHarness();
    await expect(
      h.service.composeAsync({
        authorUserId: 'user-1',
        kind: PostKind.Poll,
        body: 'Which?',
        pollOptions: ['Only one'],
        publish: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gives a story a 24-hour expiry', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Story,
      body: 'Today',
      publish: true,
    });

    expect(post.expiresOn).toBeInstanceOf(Date);
    const hours = ((post.expiresOn as Date).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('never lets a reply be wider than its parent', async () => {
    const h = makeHarness();
    const parent = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Only for close friends',
      visibility: Visibility.CloseFriends,
      publish: true,
    });

    const reply = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Comment,
      body: 'Replying in public',
      visibility: Visibility.Public,
      parentId: parent.id,
      publish: true,
    });

    expect(reply.visibility).toBe(Visibility.CloseFriends);
  });

  it('denormalises the thread root so a conversation loads in one query', async () => {
    const h = makeHarness();
    const root = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Root',
      publish: true,
    });
    const reply = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Comment,
      body: 'Reply',
      parentId: root.id,
      publish: true,
    });
    const nested = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Comment,
      body: 'Nested',
      parentId: reply.id,
      publish: true,
    });

    expect(reply.rootId).toBe(root.id);
    expect(nested.rootId).toBe(root.id);
  });

  it('extracts hashtags and resolves mentions', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Shipping #music with @bo today',
      publish: true,
    });

    expect(post.tags).toContain('music');
    expect(post.mentionedProfileIds).toEqual(['profile-2']);
  });

  it('writes searchText explicitly rather than relying on a column default', async () => {
    // A bulk INSERT that names its columns skips defaults — that is how
    // `contentStreams.searchText` landed NULL on every row.
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Findable text',
      publish: true,
    });

    expect(post.searchText).toContain('Findable text');
    expect(post.searchText).toContain('@anna');
  });

  it('records external targets as pending without blocking the publish', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Cross-posted',
      externalPlatforms: ['youtube', 'linkedin'],
      publish: true,
    });

    expect(post.status).toBe(PostStatus.Published);
    expect(post.externalTargets).toEqual([
      { platform: 'youtube', status: 'pending' },
      { platform: 'linkedin', status: 'pending' },
    ]);
  });

  it('emits a published event with what listeners need', async () => {
    const h = makeHarness();
    const received: unknown[] = [];
    h.emitter.on('social.post.published', (payload) => received.push(payload));

    await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Announce me',
      publish: true,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      authorProfileId: 'profile-1',
      visibility: Visibility.Public,
    });
  });

  it('does not emit for a draft', async () => {
    const h = makeHarness();
    const received: unknown[] = [];
    h.emitter.on('social.post.published', (payload) => received.push(payload));

    await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Draft',
      publish: false,
    });

    expect(received).toHaveLength(0);
  });

  it('rejects a reply to a post that no longer exists', async () => {
    const h = makeHarness();
    await expect(
      h.service.composeAsync({
        authorUserId: 'user-1',
        kind: PostKind.Comment,
        body: 'Hello?',
        parentId: '00000000-0000-4000-8000-000000000000',
        publish: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires a Community profile before posting', async () => {
    const h = makeHarness();
    await expect(
      h.service.composeAsync({
        authorUserId: 'nobody',
        kind: PostKind.Update,
        body: 'Hi',
        publish: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a repost with no body of its own', async () => {
    const h = makeHarness();
    const original = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Original',
      publish: true,
    });
    const repost = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Repost,
      repostOfId: original.id,
      publish: true,
    });

    expect(repost.repostOfId).toBe(original.id);
    expect(repost.status).toBe(PostStatus.Published);
  });

  it('publishing an already-published post is a no-op, not an error', async () => {
    const h = makeHarness();
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Once',
      publish: true,
    });
    const again = await h.service.publishAsync(post.id, 'user-1');
    expect(again.id).toBe(post.id);
    expect(again.status).toBe(PostStatus.Published);
  });

  it('applies the author default visibility when none is given', async () => {
    const h = makeHarness({ defaultPostVisibility: Visibility.Followers });
    const post = await h.service.composeAsync({
      authorUserId: 'user-1',
      kind: PostKind.Update,
      body: 'Quiet by default',
      publish: true,
    });
    expect(post.visibility).toBe(Visibility.Followers);
  });
});
