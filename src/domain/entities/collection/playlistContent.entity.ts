import { BaseEntity } from '../../baseEntity';
import { Playlist } from './playlist.entity';
import { PlaylistMember } from './playlistMember.entity';
import { UserContent } from '../userContent.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('playlistContent')
export class PlaylistContent extends BaseEntity {
  @ManyToOne(() => Playlist, (p) => p.contents, { onDelete: 'CASCADE' })
  playlist: Playlist;

  @ManyToOne(() => UserContent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userContentId' })
  userContent?: UserContent;

  @Column({ type: 'uuid', nullable: true })
  userContentId?: string;

  @Column({ type: 'varchar', length: 255 })
  type: string;

  @Column({ type: 'varchar', length: 30 })
  platform: string;

  @Column({ type: 'varchar', length: 255 })
  contentId: string;

  @Column()
  contentUrl: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  thumbnailUrl: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @ManyToOne(() => PlaylistMember, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'addedById' })
  addedBy: PlaylistMember;

  constructor(request: Partial<PlaylistContent> = {}) {
    super();
    Object.assign(this, request);
  }
}
