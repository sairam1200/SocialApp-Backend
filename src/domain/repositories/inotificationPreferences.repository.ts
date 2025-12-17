import { NotificationPreferences } from "domain/entities/notification/notificationPreferences.entity";
import { NotificationType } from "domain/enums";

export interface INotificationPreferencesRepository {

    findByUserId(userId: string): Promise<NotificationPreferences>
    createPreference(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences>
    updatePreference(userId: string, enabledTypes: NotificationType[], allNotificationsEnabled: boolean): Promise<NotificationPreferences>
    findOrCreate(userId: string): Promise<NotificationPreferences>

    isTypeEnabled(userId: string, type: NotificationType): Promise<boolean>

    deletePreference(userId: string): Promise<boolean>
}