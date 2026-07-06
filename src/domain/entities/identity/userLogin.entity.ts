import { BaseEntity } from '../../baseEntity';
import { Entity, Column } from 'typeorm';

@Entity({ name: 'userLogins', schema: 'identity' })
export class UserLogin extends BaseEntity {
  @Column()
  provider: string;

  @Column()
  userId: string;

  @Column()
  tokenValue: string;

  @Column()
  userAgent?: string;

  @Column()
  ipAddress?: string;

  @Column()
  deviceId?: string;

  @Column({ default: false })
  isValid: boolean;

  @Column({ type: 'timestamp', nullable: true })
  addedDateUtc?: Date;

  @Column({ type: 'timestamp' })
  expiryDateUtc: Date;

  constructor(partial?: Partial<UserLogin>) {
    super();
    Object.assign(this, partial);
  }
}
