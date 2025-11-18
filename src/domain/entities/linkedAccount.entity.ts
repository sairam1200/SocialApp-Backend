import { BaseEntity } from "../baseEntity";
import { Column, Entity } from "typeorm";

@Entity({ name: 'linkedAccounts' })
export class LinkedAccount extends BaseEntity {

  @Column()
  userId: string;

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

  constructor(request: Partial<LinkedAccount> = {}) {
    super();
    Object.assign(this, request);
  }
}