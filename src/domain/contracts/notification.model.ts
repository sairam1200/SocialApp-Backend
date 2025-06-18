import { NotificationType } from "../enums";
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ type: Date })
  readAt?: Date;

  @ApiProperty()
  sound: boolean;

  @ApiProperty()
  isLive: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty()
  notifyId: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metaData?: Record<string, any>;
}