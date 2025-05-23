import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { Notification } from "../domain/entities/notification.entity";
import { NotificationGateway } from "../infrastructure/websocket/gateways/notification.gateway";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification
    ])
  ],
  providers: [
    JwtService,
    dependency.NotificationRepository,
    dependency.NotificationService,
    NotificationGateway,
  ],
  exports: [dependency.NotificationService, dependency.NotificationRepository],
})
export class NotificationModule { }