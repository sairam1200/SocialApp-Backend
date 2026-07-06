import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, Theme } from '../enums';

export class UserPreferenceModel {
  @ApiProperty({ enum: Theme })
  theme: Theme;

  @ApiProperty({ isArray: true, enum: NotificationChannel })
  notificationChannelsEnabled: NotificationChannel[];

  constructor(partial?: Partial<UserPreferenceModel>) {
    Object.assign(this, partial);
  }
}

export class NotificationPreferenceModel {
  @ApiProperty({ isArray: true, enum: NotificationChannel })
  notificationChannelsEnabled: NotificationChannel[];

  constructor(partial?: Partial<NotificationPreferenceModel>) {
    Object.assign(this, partial);
  }
}

export class ThemePreferenceModel {
  @ApiProperty({ enum: Theme })
  theme: Theme;

  constructor(partial?: Partial<ThemePreferenceModel>) {
    Object.assign(this, partial);
  }
}
