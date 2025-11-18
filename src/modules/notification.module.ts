import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import {notification} from "../features/notification";
import { dependency } from "../infrastructure/dependency";
import { Notification } from "../domain/entities/notification/notification.entity";
import { NotificationGateway } from "../infrastructure/websocket/gateways/notification.gateway";
import { NotificationEvent } from "domain/entities/notification/notificationEvent.entity";
import { NotificationTemplate } from "domain/entities/notification/notificationTemplate.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationEvent,
      NotificationTemplate,
    ])
  ],
  providers: [
    JwtService,
    ...notification.addHandlers(),
    dependency.NotificationRepository,
    dependency.NotificationService,
    NotificationGateway,
  ],
  controllers: [
    ...notification.addControllers()
  ],
  exports: [dependency.NotificationService, dependency.NotificationRepository],
})
export class NotificationModule { }