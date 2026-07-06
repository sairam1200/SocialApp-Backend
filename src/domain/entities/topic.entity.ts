import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../baseEntity';
import { UserTopic } from './userTopic.entity';

@Entity({ name: 'topics' })
export class Topic extends BaseEntity {
  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  icon?: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => UserTopic, (userTopic) => userTopic.topic)
  userTopics: UserTopic[];

  constructor(request: Partial<Topic> = {}) {
    super();
    Object.assign(this, request);
  }
}
