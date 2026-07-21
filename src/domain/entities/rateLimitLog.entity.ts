import { BaseEntity } from '../baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'rateLimitLogs' })
export class RateLimitLog extends BaseEntity {
  @Column()
  ip: string;

  @Column()
  route: string;

  @Column()
  count: number;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column()
  expiredAt: Date;

  constructor(partial: Partial<RateLimitLog>) {
    super();
    Object.assign(this, partial);
  }
}
