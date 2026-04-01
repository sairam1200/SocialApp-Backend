import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../baseEntity";

@Entity({ name: "userContents" })
@Index(['userId', 'platform', 'externalId'], { unique: true })
export class UserContent extends BaseEntity {

  @Column({ nullable: false })
  userId: string;

  @Column({ nullable: false })
  type: string;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: false })
  platform: string;

  @Column({ nullable: false })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  text?: string;

  @Column({ type: 'jsonb', nullable: true })
  media?: any[]; // Array of assets: [{ url, type, thumbnail }]

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  engagement?: any; // Standardized: { likes, shares, comments, views }

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  constructor(request: Partial<UserContent> = {}) {
    super();
    Object.assign(this, request);
  }
}