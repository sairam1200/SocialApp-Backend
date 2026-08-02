import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import _const from '../../../core/utils/const';
import {
  ConversationModel,
  MessageModel,
} from '../../../domain/contracts/social.model';
import {
  Conversation,
  ConversationMember,
  Message,
  SocialProfile,
} from '../../../domain/entities/social';
import { ConversationKind } from '../../../domain/enums';
import { mapProfileSummary } from '../../../domain/mappers/social.mapper';
import {
  FeedCursor,
  IEngagementRepository,
  IMessagingRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';

/**
 * Direct and group messaging.
 *
 * A DM between two people is a conversation with a deterministic `directKey`
 * (the two profile ids, sorted, joined) and a unique index on it. That is what
 * makes "message this person" an upsert instead of a search that occasionally
 * creates a second thread between the same two people — a bug every chat
 * feature discovers eventually.
 */
@Injectable()
export class MessagingService {
  constructor(
    @Inject(_const.IMESSAGING_REPOSITORY)
    private readonly messaging: IMessagingRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async openDirectAsync(input: {
    userId: string;
    targetProfileId: string;
  }): Promise<Conversation> {
    const me = await this.requireProfileAsync(input.userId);
    if (me.id === input.targetProfileId) {
      throw new BadRequestException('You cannot message yourself.');
    }

    const target = await this.profiles.getByIdAsync(input.targetProfileId);
    if (!target) throw new NotFoundException('Profile not found.');

    const blocked = await this.engagement.getBlockedPairIdsAsync(me.id);
    if (blocked.includes(target.id)) {
      throw new ForbiddenException('You cannot message this profile.');
    }

    const directKey = directKeyFor(me.id, target.id);
    const existing = await this.messaging.getDirectConversationAsync(directKey);
    if (existing) return existing;

    return this.messaging.createConversationAsync(
      new Conversation({ kind: ConversationKind.Direct, directKey }),
      [
        new ConversationMember({ profileId: me.id, conversationId: '' }),
        new ConversationMember({ profileId: target.id, conversationId: '' }),
      ],
    );
  }

  public async listAsync(
    userId: string,
    cursor: FeedCursor,
  ): Promise<ConversationModel[]> {
    const me = await this.requireProfileAsync(userId);
    const conversations = await this.messaging.listConversationsAsync(
      me.id,
      cursor,
    );
    if (conversations.length === 0) return [];

    // Members for every conversation in one query, then profiles in one more.
    const members = await this.messaging.getActiveMembersAsync(
      conversations.map((c) => c.id),
    );
    const profiles = await this.profiles.getManyByIdsAsync(
      Array.from(new Set(members.map((m) => m.profileId))),
    );
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    return conversations.map((conversation) => {
      const own = members.find(
        (m) => m.conversationId === conversation.id && m.profileId === me.id,
      );
      return {
        id: conversation.id,
        kind: conversation.kind,
        title: conversation.title,
        participants: members
          .filter(
            (m) =>
              m.conversationId === conversation.id && m.profileId !== me.id,
          )
          .map((m) => mapProfileSummary(profileById.get(m.profileId)))
          .slice(0, 20),
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageOn: conversation.lastMessageOn ?? null,
        unreadCount: own?.unreadCount ?? 0,
      };
    });
  }

  public async sendAsync(input: {
    userId: string;
    conversationId: string;
    body?: string;
    sharedPostId?: string;
    media?: Array<{ url: string; kind: string; thumbnailUrl?: string }>;
  }): Promise<MessageModel> {
    const me = await this.requireProfileAsync(input.userId);
    const membership = await this.messaging.getMemberAsync(
      input.conversationId,
      me.id,
    );
    if (!membership || membership.leftOn) {
      throw new ForbiddenException('You are not part of this conversation.');
    }

    const body = (input.body ?? '').trim().slice(0, 5000);
    if (!body && !input.sharedPostId && !input.media?.length) {
      throw new BadRequestException(
        'A message needs text, media or a shared post.',
      );
    }

    const message = await this.messaging.appendMessageAsync(
      new Message({
        conversationId: input.conversationId,
        senderProfileId: me.id,
        body: body || undefined,
        sharedPostId: input.sharedPostId ?? null,
        media: input.media ?? null,
      }),
    );

    this.eventEmitter.emit('social.message.sent', {
      conversationId: input.conversationId,
      messageId: message.id,
      senderProfileId: me.id,
      preview: body.slice(0, 120),
    });

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: mapProfileSummary(me),
      body: message.body,
      sharedPost: null,
      media: message.media ?? null,
      createdOn: message.createdOn,
    };
  }

  public async listMessagesAsync(input: {
    userId: string;
    conversationId: string;
    cursor: FeedCursor;
  }): Promise<MessageModel[]> {
    const me = await this.requireProfileAsync(input.userId);
    const membership = await this.messaging.getMemberAsync(
      input.conversationId,
      me.id,
    );
    if (!membership) {
      throw new ForbiddenException('You are not part of this conversation.');
    }

    const messages = await this.messaging.listMessagesAsync(
      input.conversationId,
      input.cursor,
    );
    const senders = await this.profiles.getManyByIdsAsync(
      Array.from(new Set(messages.map((m) => m.senderProfileId))),
    );
    const byId = new Map(senders.map((s) => [s.id, s]));

    // Reading a conversation clears its unread badge. Doing it here rather
    // than in a separate endpoint means the badge cannot get stuck when a
    // client forgets the second call.
    await this.messaging.markReadAsync(input.conversationId, me.id);

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: mapProfileSummary(byId.get(m.senderProfileId)),
      body: m.body,
      sharedPost: null,
      media: m.media ?? null,
      createdOn: m.createdOn,
    }));
  }

  public async countUnreadAsync(userId: string): Promise<number> {
    const me = await this.profiles.getByUserIdAsync(userId);
    return me ? this.messaging.countUnreadAsync(me.id) : 0;
  }

  private async requireProfileAsync(userId: string): Promise<SocialProfile> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');
    return profile;
  }
}

/**
 * Deterministic key for a two-party conversation.
 *
 * Sorted so `(a,b)` and `(b,a)` produce the same key — the unique index does
 * the rest.
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}
