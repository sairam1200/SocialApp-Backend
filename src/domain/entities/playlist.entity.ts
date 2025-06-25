import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { User } from './user.entity';
import { BaseEntity } from '../baseEntity';
import { PlaylistMember } from './playlistMember.entity';

@Entity('playlists')
export class Playlist extends BaseEntity {

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, unique: true })
  referenceId: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => User, user => user.playlistMemberships, { nullable: false, onDelete: 'CASCADE' })
  owner: User;

  @OneToMany(
    () => PlaylistMember,
    entry => entry.playlist,
    { cascade: ['insert'] }
  )
  members: PlaylistMember[];

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @BeforeInsert()
  private generateReferenceId() {
    // slugify the name, limit to 20 chars, make it URL-safe
    const base = slugify(this.name, { lower: true, strict: true }).substring(0, 20);
    // generate a 6-char random suffix
    const suffix = nanoid(6).toLowerCase();
    this.referenceId = `${base}-${suffix}`;
  }

  constructor(request: Partial<Playlist> = {}) {
    super();
    Object.assign(this, request);
  }
}