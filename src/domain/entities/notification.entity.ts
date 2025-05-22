import { Column, Entity } from "typeorm";
import { BaseEntity } from "../baseEntity";
import { NotificationType } from "../enums";

@Entity({ name: "notifications" })
export class Notification extends BaseEntity {

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column()
  title: string;

  @Column()
  body: string;

  @Column({ type: 'uuid' })
  receiverId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt?: Date;
}