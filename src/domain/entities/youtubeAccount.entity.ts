import { BaseEntity } from '../baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'youtube_accounts' })
export class YoutubeAccount extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ name: 'channel_id' })
  @Index({ unique: true })
  channelId: string;

  @Column({ name: 'channel_title' })
  channelTitle: string;

  @Column({ name: 'access_token' })
  accessToken: string;

  @Column({ name: 'refresh_token' })
  refreshToken: string;

  @Column({ name: 'token_expiry' })
  tokenExpiry: Date;

  @Column({ default: true })
  connected: boolean;

  @Column({ name: 'disconnected_at', nullable: true })
  disconnectedAt?: Date;

  constructor(request: Partial<YoutubeAccount> = {}) {
    super();
    Object.assign(this, request);
  }
}
