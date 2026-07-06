import { User } from '../identity/user.entity';
import { BaseEntity } from '../../baseEntity';
import { PlaylistMemberRole } from '../../enums';
import { Playlist } from './playlist.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
} from 'typeorm';

@Entity('playlistMembers')
@Index(['playlist', 'user'], { unique: true })
export class PlaylistMember extends BaseEntity {
  @ManyToOne(() => Playlist, (c) => c.members, { onDelete: 'CASCADE' })
  playlist: Playlist;

  @ManyToOne(() => User, (u) => u.playlistMemberships, { onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: PlaylistMemberRole,
    default: PlaylistMemberRole.Viewer,
  })
  role: PlaylistMemberRole;

  @CreateDateColumn()
  joinedAt: Date;

  @DeleteDateColumn()
  removedAt?: Date;
}
