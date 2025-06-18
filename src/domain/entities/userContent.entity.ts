import { Column, Entity } from "typeorm";
import { BaseEntity } from "../baseEntity";

@Entity({ name: "userContents" })
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

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  constructor(request: Partial<UserContent> = {}) {
    super();
    Object.assign(this, request);
  }
}