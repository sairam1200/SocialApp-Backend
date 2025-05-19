import { BaseEntity } from "../baseEntity";
import { Column, Entity } from "typeorm";

@Entity({ name: 'linkedAccounts' })
export class LinkedAccount extends BaseEntity {

  @Column()
  userId: string;

  @Column()
  platform: string;

  @Column()
  username: string;

  @Column({ nullable: true })
  profileImage?: string;

  @Column()
  externalId: string;

  @Column()
  email: string;

  @Column({ default: false })
  allowImport: boolean;

  @Column({ default: 0 })
  followersCount: number;

  @Column({ default: 0 })
  followingCount: number;

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  constructor(request: Partial<LinkedAccount> = {}) {
    super();
    Object.assign(this, request);
  }
}