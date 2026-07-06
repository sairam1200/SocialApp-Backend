import { BaseEntity } from '../baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'youtube_accounts' })
export class YoutubeAccount extends BaseEntity {
  @Column()
  userId: string;

  @Column()
  @Index({ unique: true })
  channelId: string;

  @Column()
  channelTitle: string;

  @Column()
  accessToken: string;

  @Column()
  refreshToken: string;

  @Column()
  tokenExpiry: Date;

  @Column({ default: true })
  connected: boolean;

  @Column({ nullable: true })
  disconnectedAt?: Date;

  constructor(request: Partial<YoutubeAccount> = {}) {
    super();
    Object.assign(this, request);
  }
}
