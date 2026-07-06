import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationGateway } from "../../websocket/gateways/notification.gateway";
import { FollowUpdatedEvent } from "../../../domain/events/follow-updated.event";
import logger from "../../../core/utils/winston.util";

@Injectable()
export class FollowUpdatedListener {
  constructor(private readonly gateway: NotificationGateway) {}

  @OnEvent("follow.updated", { async: true })
  handle(payload: FollowUpdatedEvent): void {
    try {
      this.gateway.emitFollowUpdated(payload.viewerUserId, {
        targetUserId: payload.targetUserId,
        viewerUserId: payload.viewerUserId,
        isFollowing: payload.isFollowing,
        targetFollowersCount: payload.targetFollowersCount,
        viewerFollowingCount: payload.viewerFollowingCount,
      });

      this.gateway.emitFollowUpdated(payload.targetUserId, {
        targetUserId: payload.targetUserId,
        viewerUserId: payload.viewerUserId,
        isFollowing: payload.isFollowing,
        targetFollowersCount: payload.targetFollowersCount,
        viewerFollowingCount: payload.viewerFollowingCount,
      });
    } catch (err: any) {
      logger.error(`[FollowUpdatedListener] Failed to emit follow.updated event: ${err.message}`);
    }
  }
}
