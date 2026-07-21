import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../baseEntity';

@Entity({ name: 'rateLimits' })
@Index(['ip', 'route'], { unique: true })
export class RateLimit extends BaseEntity {
  @Column()
  ip: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column()
  route: string;

  @Column({ default: 0 })
  count: number;

  @Column()
  expiresAt: Date;

  constructor(partial: Partial<RateLimit>) {
    super();
    Object.assign(this, partial);
  }
}
