import { Entity, Column, ManyToOne, Unique, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';
import { User } from './identity/user.entity';
import { FollowStatus } from '../enums';

@Entity({ name: 'user_follows', schema: 'identity' })
@Unique(['followerId', 'followedId'])
export class UserFollow extends BaseEntity {

  @Column({ type: 'uuid' })
  @Index('idx_user_follows_follower')
  followerId: string;

  @Column({ type: 'uuid' })
  @Index('idx_user_follows_followed')
  followedId: string;

  @ManyToOne(() => User, user => user.following, { onDelete: 'CASCADE' })
  follower: User;

  @ManyToOne(() => User, user => user.followers, { onDelete: 'CASCADE' })
  followed: User;

  @Column({
    type: 'enum',
    enum: FollowStatus,
    default: FollowStatus.Accepted
  })
  status: FollowStatus;

  constructor(request: Partial<UserFollow> = {}) {
    super();
    Object.assign(this, request);
  }
}
