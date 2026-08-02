import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import { ConversationKind, ReportReason, ReportStatus } from '../../enums';

/** A direct or group conversation. */
@Entity({ name: 'conversations', schema: 'social' })
export class Conversation extends BaseEntity {
  @Column({
    type: 'enum',
    enum: ConversationKind,
    default: ConversationKind.Direct,
  })
  kind: ConversationKind;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title?: string;

  /**
   * Sorted, joined participant ids for a direct conversation.
   * Unique, so "open a DM with X" is an upsert rather than a scan that
   * occasionally creates a second thread between the same two people.
   */
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  @Index('idx_conversations_direct_key')
  directKey?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index('idx_conversations_last_message')
  lastMessageOn?: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  lastMessagePreview?: string;

  constructor(request: Partial<Conversation> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'conversation_members', schema: 'social' })
@Unique('uq_conversation_members', ['conversationId', 'profileId'])
export class ConversationMember extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_conversation_members_conversation')
  conversationId: string;

  @Column({ type: 'uuid' })
  @Index('idx_conversation_members_profile')
  profileId: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastReadOn?: Date | null;

  @Column({ type: 'integer', default: 0 })
  unreadCount: number;

  @Column({ type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  leftOn?: Date | null;

  constructor(request: Partial<ConversationMember> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'messages', schema: 'social' })
@Index('idx_messages_conversation_time', ['conversationId', 'createdOn'])
export class Message extends BaseEntity {
  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'uuid' })
  @Index('idx_messages_sender')
  senderProfileId: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  /** A shared post, product or profile travelling inside a message. */
  @Column({ type: 'uuid', nullable: true })
  sharedPostId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  media?: Array<{ url: string; kind: string; thumbnailUrl?: string }> | null;

  @Column({ type: 'timestamptz', nullable: true })
  editedOn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedOn?: Date | null;

  constructor(request: Partial<Message> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * A user report against any object.
 *
 * `subjectKind` keeps this one table serving posts, comments, profiles,
 * products, chat messages and streams — a second reports table per object type
 * would fork the moderation queue, which is the part that must stay unified.
 */
@Entity({ name: 'reports', schema: 'social' })
export class Report extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_reports_reporter')
  reporterProfileId: string;

  @Column({ type: 'uuid' })
  @Index('idx_reports_subject')
  subjectId: string;

  @Column({ type: 'varchar', length: 24 })
  subjectKind: string;

  @Column({ type: 'enum', enum: ReportReason })
  reason: ReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detail?: string;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.Open })
  @Index('idx_reports_status')
  status: ReportStatus;

  @Column({ type: 'uuid', nullable: true })
  resolvedByUserId?: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  resolution?: string;

  constructor(request: Partial<Report> = {}) {
    super();
    Object.assign(this, request);
  }
}
