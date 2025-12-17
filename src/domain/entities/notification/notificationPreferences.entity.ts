import { BaseEntity } from "domain/baseEntity";
import { NotificationType } from "domain/enums";
import { Column, Entity, Index } from "typeorm";

@Entity({name: "notification_preferences", schema: "notification"})
@Index(["userId"], {unique: true})
export class NotificationPreferences extends BaseEntity{

    @Column({type: "uuid"})
    userId: string;

    @Column({type: "json"})
    enabledTypes: NotificationType[];

    @Column({type: "boolean", default: true})
    allNotificationsEnabled: boolean;

    
}