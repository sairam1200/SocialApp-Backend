import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import { Post } from './post.entity';

/**
 * A poll option. The poll itself is the post — there is no `polls` table,
 * because a poll adds nothing to a post except its options and a closing time,
 * and both fit where they are already read from.
 */
@Entity({ name: 'poll_options', schema: 'social' })
export class PollOption extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_poll_options_post')
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post?: Post;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'integer', default: 0 })
  position: number;

  /** Denormalised tally. `poll_votes` is the source of truth. */
  @Column({ type: 'integer', default: 0 })
  votesCount: number;

  constructor(request: Partial<PollOption> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** One vote per voter per poll, enforced by the unique constraint. */
@Entity({ name: 'poll_votes', schema: 'social' })
@Unique('uq_poll_votes_voter', ['postId', 'voterProfileId'])
export class PollVote extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_poll_votes_post')
  postId: string;

  @Column({ type: 'uuid' })
  @Index('idx_poll_votes_option')
  optionId: string;

  @Column({ type: 'uuid' })
  @Index('idx_poll_votes_voter')
  voterProfileId: string;

  constructor(request: Partial<PollVote> = {}) {
    super();
    Object.assign(this, request);
  }
}
