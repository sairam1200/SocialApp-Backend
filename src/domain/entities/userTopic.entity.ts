import { Entity, Column, ManyToOne, Unique, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';
import { User } from './identity/user.entity';
import { Topic } from './topic.entity';

@Entity({ name: 'userTopics' })
@Unique(['userId', 'topicId'])
export class UserTopic extends BaseEntity {
  @Column()
  @Index('idx_user_topics_user')
  userId: string;

  @Column()
  @Index('idx_user_topics_topic')
  topicId: string;

  @ManyToOne(() => User, (user) => user.userTopics, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Topic, (topic) => topic.userTopics, { onDelete: 'CASCADE' })
  topic: Topic;

  constructor(request: Partial<UserTopic> = {}) {
    super();
    Object.assign(this, request);
  }
}
