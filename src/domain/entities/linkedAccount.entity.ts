import { BaseEntity } from '../baseEntity';
import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './identity/user.entity';
import { UserContent } from './userContent.entity';

@Entity({ name: 'linkedAccounts' })
export class LinkedAccount extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.linkedAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => UserContent, (uc) => uc.linkedAccount)
  userContents: UserContent[];

  @Column()
  platform: string;

  @Column()
  userName: string;

  @Column({ nullable: true })
  profileImage?: string;

  @Column()
  externalId: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ default: false })
  allowImport: boolean;

  @Column({ default: 0 })
  followersCount: number;

  @Column({ default: 0 })
  followingCount: number;

  @Column({ default: false })
  verified: boolean;

  @Column({ nullable: true })
  externalUrl?: string;

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  @Column({ default: true })
  isVisible: boolean;

  @Column({ default: false })
  syncEnabled: boolean;

  constructor(request: Partial<LinkedAccount> = {}) {
    super();
    Object.assign(this, request);
  }
}
