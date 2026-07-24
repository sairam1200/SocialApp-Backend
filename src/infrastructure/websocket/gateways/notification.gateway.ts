import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import _const from '../../../core/utils/const';
import { NotificationModel } from '../../../domain/contracts/notification.model';
import { INotificationService } from '../../../domain/services/inotification.service';
import logger from '../../../core/utils/winston.util';
import { BaseGateway } from './base.gateway';
import { CORS_ORIGINS } from '../../../core/configs/cors.config';

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
})
export class NotificationGateway
  extends BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  protected gatewayName = 'NotificationGateway';

  private connectedUsers = new Map<string, Set<string>>();

  constructor(
    jwtService: JwtService,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
  ) {
    super(jwtService);
  }

  async handleConnection(client: Socket) {
    const authResult = await this.authenticateClient(client);

    if (!authResult) {
      logger.warn(
        `[${this.gatewayName}] Failed to authenticate connection from ${client.handshake.address}`,
      );
      this.emitError(
        client,
        'AUTHENTICATION_FAILED',
        'Invalid or missing authentication token',
      );
      client.disconnect();
      return;
    }

    const { userId, user } = authResult;

    this.setupClientData(client, userId, user);
    client.join(userId);

    // Track connected users
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(client.id);

    client.emit('connected', { connectedUserId: userId });
    logger.info(
      `[${this.gatewayName}] User ${userId} connected (socket: ${client.id})`,
    );
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
      logger.info(
        `[${this.gatewayName}] User ${userId} disconnected (socket: ${client.id})`,
      );
    }
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    if (!this.validateUserId(client, userId)) {
      this.emitError(client, 'UNAUTHORIZED', 'Cannot join other user rooms');
      logger.warn(
        `[${this.gatewayName}] User ${client.data.userId} attempted to join room ${userId}`,
      );
      return;
    }

    client.join(userId);
    logger.debug(`[${this.gatewayName}] User ${userId} joined room`);
  }

  emitNewNotification(userId: string, notificationData: NotificationModel) {
    this.safeEmit(userId, 'new-notification', notificationData);
  }

  emitNotificationUpdated(userId: string, notificationData: NotificationModel) {
    this.safeEmit(userId, 'notification-updated', notificationData);
  }

  emitNotificationRead(userId: string, readAt: Date) {
    this.safeEmit(userId, 'notification-read', readAt);
  }

  @SubscribeMessage('mark-as-read')
  async handleMarkAsRead(
    @MessageBody() payload: { notificationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      this.emitError(client, 'UNAUTHORIZED', 'Not authenticated');
      logger.warn(
        `[${this.gatewayName}] Unauthorized mark-as-read attempt from socket ${client.id}`,
      );
      return;
    }

    if (
      !payload?.notificationId ||
      typeof payload.notificationId !== 'string'
    ) {
      this.emitError(
        client,
        'INVALID_PAYLOAD',
        'notificationId is required and must be a string',
      );
      return;
    }

    try {
      await this.notificationService.markAsReadAsync(
        payload.notificationId,
        userId,
      );
      client.emit('mark-as-read:success', {
        notificationId: payload.notificationId,
      });
      logger.debug(
        `[${this.gatewayName}] Notification ${payload.notificationId} marked as read by user ${userId}`,
      );
    } catch (error) {
      logger.error(
        `[${this.gatewayName}] Error marking notification as read`,
        error,
      );
      this.emitError(
        client,
        'INTERNAL_ERROR',
        'Failed to mark notification as read',
      );
    }
  }

  @SubscribeMessage('mark-all-as-read')
  async handleMarkAllAsRead(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      this.emitError(client, 'UNAUTHORIZED', 'Not authenticated');
      logger.warn(
        `[${this.gatewayName}] Unauthorized mark-all-as-read attempt from socket ${client.id}`,
      );
      return;
    }

    try {
      await this.notificationService.markAllAsRead(userId);
      client.emit('mark-all-as-read:success');
      logger.debug(
        `[${this.gatewayName}] All notifications marked as read by user ${userId}`,
      );
    } catch (error) {
      logger.error(
        `[${this.gatewayName}] Error marking all notifications as read`,
        error,
      );
      this.emitError(
        client,
        'INTERNAL_ERROR',
        'Failed to mark all notifications as read',
      );
    }
  }

  emitProfileUpdated(
    userId: string,
    payload: {
      userId: string;
      updates: {
        photo?: string | null;
        linkedAccounts?: Array<{
          id: string;
          platform: string;
          username: string;
          profileImage: string | null;
          isImported: boolean;
          externalId: string;
          externalUrl: string;
          followersCount: number;
          followingCount: number;
          isVerified: boolean;
        }>;
        totalPosts?: number;
      };
    },
  ) {
    this.safeEmit(userId, 'profile-update', payload);
  }

  emitFollowUpdated(
    userId: string,
    payload: {
      targetUserId: string;
      viewerUserId: string;
      isFollowing: boolean;
      targetFollowersCount: number;
      viewerFollowingCount: number;
    },
  ) {
    this.safeEmit(userId, 'follow.updated', payload);
  }

  emitProfileStatsUpdated(userId: string, totalPosts: number) {
    this.safeEmit(userId, 'profile-update', {
      userId,
      updates: { totalPosts },
    });
  }

  isUserConnected(userId: string): boolean {
    return (
      this.connectedUsers.has(userId) &&
      this.connectedUsers.get(userId)!.size > 0
    );
  }

  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }
}
