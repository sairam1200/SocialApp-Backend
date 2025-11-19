import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection
} from "@nestjs/websockets";
import configs from "../../../configs";
import { Server, Socket } from 'socket.io';
import _const from "../../../core/utils/const";
import { Globals } from "../../../core/globals";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { INotificationService } from "../../../domain/services/inotification.service";

@Injectable()
@WebSocketGateway({ namespace: '/notifications' })
export class NotificationGateway implements OnGatewayConnection {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService
  ) { }

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join')
  handleJoin(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(userId);
  }

  async handleConnection(client: Socket) {
    const userId = await this.getUserIdFromToken(client);
    if (userId) {
      client.join(userId);
    }
  }

  emitNewNotification(userId: string, notificationData: NotificationModel) {
    this.server.to(userId).emit('new-notification', notificationData);
  }

  emitNotificationUpdated(userId: string, notificationData: NotificationModel) {
    this.server.to(userId).emit('notification-updated', notificationData);
  }

  emitNotificationRead(userId: string, readAt: Date) {
    this.server.to(userId).emit('notification-read', readAt);
  }

  @SubscribeMessage('mark-as-read')
  async handleMarkAsRead(client: Socket, payload: { notificationId: string }) {
    const userId = await this.getUserIdFromToken(client);
    if (!userId) return;

    await this.notificationService.markAsReadAsync(payload.notificationId, userId);
  }

  @SubscribeMessage('mark-all-as-read')
  async handleMarkAllAsRead(client: Socket) {
    const userId = await this.getUserIdFromToken(client);
    if (!userId) return;

    await this.notificationService.markAllAsRead(userId);
  }

  private async getUserIdFromToken(client: Socket): Promise<string | null> {
    const accessToken = client.handshake.auth.token;
    try {
      const user = await this.jwtService.verifyAsync(accessToken, {
        secret: configs.jwt.secret,
        issuer: configs.jwt.issuer,
        audience: configs.jwt.audience
      });

      return user[Globals.ClaimTypes.UserId];
    } catch (err) {
      console.warn('Invalid JWT token', err.message);
      return null;
    }
  }
}