import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import configs from '../../../configs';
import { Globals } from '../../../core/globals';
import logger from '../../../core/utils/winston.util';
import { JwtPayload } from '../../../core/passport/jwtPayload';

export abstract class BaseGateway {
  protected abstract server: Server;
  protected abstract gatewayName: string;

  constructor(protected readonly jwtService: JwtService) {}

  protected async authenticateClient(
    client: Socket,
  ): Promise<{ userId: string; user: JwtPayload } | null> {
    const accessToken = client.handshake.auth.token;

    if (!accessToken) {
      logger.warn(`[${this.gatewayName}] No token provided in handshake`);
      return null;
    }

    try {
      const user = await this.jwtService.verifyAsync(accessToken, {
        secret: configs.jwt.secret,
        issuer: configs.jwt.issuer,
        audience: configs.jwt.audience,
      });

      const userId = user[Globals.ClaimTypes.UserId];
      if (!userId) {
        logger.warn(`[${this.gatewayName}] Token missing userId claim`);
        return null;
      }

      return { userId, user };
    } catch (err) {
      logger.warn(`[${this.gatewayName}] Invalid JWT token: ${err.message}`);
      return null;
    }
  }

  protected setupClientData(
    client: Socket,
    userId: string,
    user: JwtPayload,
  ): void {
    client.data.userId = userId;
    client.data.user = user;
    client.data.headers = client.handshake.headers;
    client.data.request = client.handshake;
    client.data.connectedAt = new Date();
  }

  protected validateUserId(client: Socket, targetUserId: string): boolean {
    const clientUserId = client.data.userId;
    if (!clientUserId) {
      return false;
    }
    return clientUserId === targetUserId;
  }

  protected emitError(client: Socket, code: string, message: string): void {
    client.emit('error', { code, message, timestamp: new Date() });
  }

  protected safeEmit(userId: string, event: string, data: any): void {
    if (!this.server) {
      logger.error(
        `[${this.gatewayName}] Server not initialized, cannot emit ${event}`,
      );
      return;
    }

    try {
      this.server.to(userId).emit(event, data);
    } catch (error) {
      logger.error(
        `[${this.gatewayName}] Failed to emit ${event} to user ${userId}`,
        error,
      );
    }
  }
}
