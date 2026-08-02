import { Injectable } from '@nestjs/common';
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
import logger from '../../../core/utils/winston.util';
import { BaseGateway } from './base.gateway';
import { CORS_ORIGINS } from '../../../core/configs/cors.config';

@Injectable()
@WebSocketGateway({
  namespace: '/bookmarks',
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
})
export class BookmarkGateway
  extends BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  protected gatewayName = 'BookmarkGateway';
  private connectedUsers = new Map<string, Set<string>>();

  constructor(jwtService: JwtService) {
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

  emitBookmarkAdded(userId: string, payload: { contentId: string }) {
    this.safeEmit(userId, 'bookmark-added', payload);
  }

  emitBookmarkRemoved(userId: string, payload: { contentId: string }) {
    this.safeEmit(userId, 'bookmark-removed', payload);
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
