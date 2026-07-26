import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  Conversation,
  ConversationMember,
  Message,
} from '../../../domain/entities/social';
import {
  FeedCursor,
  IMessagingRepository,
} from '../../../domain/repositories/isocial.repository';

@Injectable()
export class MessagingRepository implements IMessagingRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMember)
    private readonly members: Repository<ConversationMember>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    private readonly dataSource: DataSource,
  ) {}

  public async getConversationAsync(id: string): Promise<Conversation | null> {
    if (!id) return null;
    return this.conversations.findOne({ where: { id } });
  }

  public async getDirectConversationAsync(
    directKey: string,
  ): Promise<Conversation | null> {
    if (!directKey) return null;
    return this.conversations.findOne({ where: { directKey } });
  }

  /**
   * Conversation and its members in one transaction.
   *
   * A conversation with no members is unreachable — nobody can list it, so it
   * can never be repaired. Creating both together is the only way that state
   * is impossible rather than merely unlikely.
   */
  public async createConversationAsync(
    conversation: Conversation,
    members: ConversationMember[],
  ): Promise<Conversation> {
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Conversation, conversation);
      await manager.save(
        ConversationMember,
        members.map((m) => {
          m.conversationId = saved.id;
          return m;
        }),
      );
      return saved;
    });
  }

  public async listConversationsAsync(
    profileId: string,
    cursor: FeedCursor,
  ): Promise<Conversation[]> {
    const builder = this.conversations
      .createQueryBuilder('c')
      .innerJoin(
        ConversationMember,
        'm',
        'm."conversationId" = c."id" AND m."profileId" = :profileId',
        { profileId },
      )
      .where('m."leftOn" IS NULL')
      .orderBy('c."lastMessageOn"', 'DESC', 'NULLS LAST')
      .addOrderBy('c."createdOn"', 'DESC')
      .limit(Math.min(cursor.limit, 100));
    if (cursor.before) {
      builder.andWhere('c."lastMessageOn" < :before', {
        before: new Date(cursor.before),
      });
    }
    return builder.getMany();
  }

  public async getMembersAsync(
    conversationId: string,
  ): Promise<ConversationMember[]> {
    return this.members.find({ where: { conversationId } });
  }

  public async getMemberAsync(
    conversationId: string,
    profileId: string,
  ): Promise<ConversationMember | null> {
    return this.members.findOne({ where: { conversationId, profileId } });
  }

  public async updateMemberAsync(
    id: string,
    changes: Partial<ConversationMember>,
  ): Promise<void> {
    await this.members.update(id, changes);
  }

  /**
   * Append a message, bump the conversation preview and every other member's
   * unread count, in one transaction.
   *
   * Doing these as three separate writes leaves a window where the message
   * exists but the inbox says nothing arrived, which reads as a lost message.
   */
  public async appendMessageAsync(message: Message): Promise<Message> {
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Message, message);
      const preview = (message.body ?? '[attachment]').slice(0, 200);

      await manager.update(Conversation, message.conversationId, {
        lastMessageOn: saved.createdOn,
        lastMessagePreview: preview,
      });

      await manager.query(
        `UPDATE "social"."conversation_members"
         SET "unreadCount" = "unreadCount" + 1
         WHERE "conversationId" = $1 AND "profileId" <> $2 AND "leftOn" IS NULL`,
        [message.conversationId, message.senderProfileId],
      );
      return saved;
    });
  }

  public async listMessagesAsync(
    conversationId: string,
    cursor: FeedCursor,
  ): Promise<Message[]> {
    const builder = this.messages
      .createQueryBuilder('m')
      .where('m."conversationId" = :conversationId', { conversationId })
      .andWhere('m."deletedOn" IS NULL')
      .orderBy('m."createdOn"', 'DESC')
      .limit(Math.min(cursor.limit, 100));
    if (cursor.before) {
      builder.andWhere('m."createdOn" < :before', {
        before: new Date(cursor.before),
      });
    }
    const rows = await builder.getMany();
    return rows.reverse();
  }

  public async markReadAsync(
    conversationId: string,
    profileId: string,
  ): Promise<void> {
    await this.members.update(
      { conversationId, profileId },
      { unreadCount: 0, lastReadOn: new Date() },
    );
  }

  public async countUnreadAsync(profileId: string): Promise<number> {
    const rows = await this.members
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m."unreadCount"), 0)', 'total')
      .where('m."profileId" = :profileId', { profileId })
      .andWhere('m."leftOn" IS NULL')
      .getRawOne<{ total: string }>();
    return Number(rows?.total ?? 0);
  }

  /**
   * Active members of several conversations at once.
   *
   * Used by the WebSocket gateway to resolve who to push a new message to
   * without one query per conversation.
   */
  public async getActiveMembersAsync(
    conversationIds: string[],
  ): Promise<ConversationMember[]> {
    if (conversationIds.length === 0) return [];
    return this.members.find({
      where: { conversationId: In(conversationIds), leftOn: IsNull() },
    });
  }
}
