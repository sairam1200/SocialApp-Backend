import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { Post } from '../../../domain/entities/social';
import { PostKind, PostStatus, Visibility } from '../../../domain/enums';
import {
  IPostRepository,
  ISocialProfileRepository,
  IStreamRepository,
} from '../../../domain/repositories/isocial.repository';
import { IIdentityRepository } from '../../../domain/repositories';
import { buildSearchText, summarise } from '../../../core/utils/recommendation';
import { BrandedEmailService } from './branded-email.service';

/**
 * Everything that happens *because* something happened.
 *
 * Notifications, the live post, the welcome email. All of it downstream of an
 * event, so the action that triggered it has already succeeded and cannot be
 * undone by a failure here. A listener that throws is logged and dropped —
 * that is the correct behaviour for a consequence, and the wrong behaviour for
 * a cause, which is why causes are not in this file.
 */
@Injectable()
export class CommunityEventListener {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ISTREAM_REPOSITORY)
    private readonly streams: IStreamRepository,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    private readonly email: BrandedEmailService,
  ) {}

  /**
   * A stream went live — announce it in the feed.
   *
   * The live becomes a post, so it appears where everything else does rather
   * than only on a separate page nobody visits. Bound to the stream by
   * `streamId`, so ending the broadcast can archive it.
   */
  @OnEvent('social.stream.started')
  public async onStreamStarted(payload: {
    streamId: string;
    profileId: string;
    title?: string;
    visibility: Visibility;
  }): Promise<void> {
    try {
      const author = await this.profiles.getByIdAsync(payload.profileId);
      if (!author) return;

      const body = payload.title
        ? `Live now: ${payload.title}`
        : `${author.displayName} is live`;

      const post = await this.posts.createAsync(
        new Post({
          authorProfileId: author.id,
          kind: PostKind.Live,
          status: PostStatus.Published,
          visibility: payload.visibility,
          body,
          streamId: payload.streamId,
          topics: author.topics ?? [],
          tags: [],
          mentionedProfileIds: [],
          publishedOn: new Date(),
          searchText: buildSearchText({
            body,
            topics: author.topics,
            authorHandle: author.handle,
            authorName: author.displayName,
          }),
        }),
      );

      await this.streams.updateAsync(payload.streamId, {
        livePostId: post.id,
      });
    } catch (error) {
      logger.error('[community] could not announce a live stream', error);
    }
  }

  /**
   * A stream ended — archive its announcement.
   *
   * Leaving a "live now" post in the feed after the broadcast ends is the
   * single most annoying thing a streaming feature does.
   */
  @OnEvent('social.stream.ended')
  public async onStreamEnded(payload: { streamId: string }): Promise<void> {
    try {
      const stream = await this.streams.getByIdAsync(payload.streamId);
      if (!stream?.livePostId) return;

      await this.posts.updateAsync(stream.livePostId, {
        status: PostStatus.Archived,
      });
      await this.streams.updateAsync(stream.id, { livePostId: null });
    } catch (error) {
      logger.error('[community] could not archive a live post', error);
    }
  }

  /**
   * A post was published — fan out mention notifications.
   *
   * Only mentions, and only by email when the mentioned profile has an
   * address. In-app notifications go through the existing notification
   * service; duplicating that here would be a second notification system.
   */
  @OnEvent('social.post.published')
  public async onPostPublished(payload: {
    postId: string;
    authorProfileId: string;
    mentionedProfileIds: string[];
    visibility: Visibility;
  }): Promise<void> {
    // A followers-only post must not email someone who is not a follower.
    // Restricting mention emails to public posts is the conservative reading,
    // and the one the author would expect.
    if (payload.visibility !== Visibility.Public) return;
    if (payload.mentionedProfileIds.length === 0) return;

    try {
      const [post, author, mentioned] = await Promise.all([
        this.posts.getByIdAsync(payload.postId),
        this.profiles.getByIdAsync(payload.authorProfileId),
        this.profiles.getManyByIdsAsync(
          payload.mentionedProfileIds.slice(0, 20),
        ),
      ]);
      if (!post || !author) return;

      for (const profile of mentioned) {
        if (profile.id === author.id) continue;
        const user = await this.users.getUserByIdAsync(profile.userId);
        if (!user?.email) continue;

        await this.email.sendNotificationAsync({
          to: user.email,
          title: `${author.displayName} mentioned you`,
          body: summarise(post.body ?? '', 200) || 'in a post on Community',
          actorName: author.displayName,
          ctaUrl: `/community/${author.handle}/${post.id}`,
          ctaLabel: 'See the post',
        });
      }
    } catch (error) {
      logger.error('[community] mention notification failed', error);
    }
  }

  /**
   * A certification was issued — tell the learner where it now appears.
   */
  @OnEvent('social.certification.issued')
  public async onCertificationIssued(payload: {
    profileId: string;
    title: string;
  }): Promise<void> {
    try {
      const profile = await this.profiles.getByIdAsync(payload.profileId);
      if (!profile) return;
      const user = await this.users.getUserByIdAsync(profile.userId);
      if (!user?.email) return;

      await this.email.sendNotificationAsync({
        to: user.email,
        title: `You earned: ${payload.title}`,
        body: 'It is now on your profile, with a code anyone can verify.',
        ctaUrl: `/community/${profile.handle}`,
        ctaLabel: 'See your profile',
      });
    } catch (error) {
      logger.error('[community] certification email failed', error);
    }
  }
}
