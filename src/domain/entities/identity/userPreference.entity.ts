import {
  Entity,
  Column,
  PrimaryColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";
import { NotificationChannel, Theme } from "../../enums";

@Entity({ name: 'userPreferences' })
export class UserPreference {
  @PrimaryColumn('uuid')
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: Theme,
    default: Theme.System,
  })
  theme: Theme;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    array: true,
  })
  notificationChannelsEnabled: NotificationChannel[];

  constructor(request: Partial<UserPreference> = {}) {
    Object.assign(this, request);
  }
}
