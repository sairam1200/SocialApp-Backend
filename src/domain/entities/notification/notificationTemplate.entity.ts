import { BaseEntity } from "../../baseEntity";
import { Column, Entity } from "typeorm";

@Entity({ name: "notificationTemplates", schema: "notification" })
export class NotificationTemplate extends BaseEntity {

  @Column({ nullable: false })
  name: string;



}