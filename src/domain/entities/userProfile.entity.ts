import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './identity/user.entity';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'user_profiles', schema: 'identity' })
export class UserProfile extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 80, nullable: true })
  displayName?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ length: 32, default: 'system' })
  theme: string;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @CreateDateColumn()
  createdOn: Date;

  @UpdateDateColumn({ nullable: true })
  lastModifiedOn?: Date;

  constructor(request: Partial<UserProfile> = {}) {
    super();
    Object.assign(this, request);
    this.theme = request.theme ?? 'system';
    this.settings = request.settings ?? {};
    this.createdOn = request.createdOn ?? new Date();
  }
}
