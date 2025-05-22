import { Injectable } from "@nestjs/common";
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
import { Globals } from "../../../core/globals";
import logger from "../../../core/utils/winston.util";
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
@WebSocketGateway({ namespace: '/imports' })
export class ImportGateway implements OnGatewayConnection{
  constructor(private readonly jwtService: JwtService) { }

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
      logger.warn('Invalid JWT token', err.message);
      return null;
    }
  }

  emitNewImportContent(userId: string, platform: string, payload: UserContent) {
    this.server.to(userId).emit('new-content', { platform, ...payload });
  }
}