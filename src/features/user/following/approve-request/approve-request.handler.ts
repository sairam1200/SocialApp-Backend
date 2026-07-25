import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import _const from '../../../../core/utils/const';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { FollowStatus } from '../../../../domain/enums';
import { FollowUpdatedEvent } from '../../../../domain/events/follow-updated.event';
import { IUserFollowRepository } from '../../../../domain/repositories/iuserFollow.repository';
import { ProfileCacheService } from '../../../../infrastructure/services/profileCache.service';
import redis from '../../../../core/utils/redis.util';

export class ApproveFollowRequestCommand {
  constructor(
    public followedUserId: string,
    public followerId: string,
  ) {}
}

@CommandHandler(ApproveFollowRequestCommand)
export class ApproveFollowRequestCommandHandler implements ICommandHandler<ApproveFollowRequestCommand> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
    private readonly profileCache: ProfileCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(command: ApproveFollowRequestCommand): Promise<void> {
    const existing = await this.follows.getAsync(
      command.followerId,
      command.followedUserId,
    );
    if (!existing) {
      throw new NotFoundException('Follow request not found.');
    }

    if (existing.followedId !== command.followedUserId) {
      throw new ApplicationException('You cannot approve this request.');
    }

    if (existing.status === FollowStatus.Accepted) {
      return;
    }

    if (existing.status === FollowStatus.Blocked) {
      throw new ApplicationException('This follow is blocked.');
    }

    await this.follows.updateStatusAsync(existing.id, FollowStatus.Accepted);
    await this.invalidateCaches(command.followedUserId, command.followerId);

    const [targetFollowersCount, viewerFollowingCount] = await Promise.all([
      this.follows.countFollowersAsync(
        command.followedUserId,
        FollowStatus.Accepted,
      ),
      this.follows.countFollowingAsync(
        command.followerId,
        FollowStatus.Accepted,
      ),
    ]);

    this.eventEmitter.emit(
      'follow.updated',
      new FollowUpdatedEvent(
        command.followedUserId,
        command.followerId,
        true,
        targetFollowersCount,
        viewerFollowingCount,
      ),
    );
  }

  private async invalidateCaches(
    followedUserId: string,
    followerId: string,
  ): Promise<void> {
    const followedKey = redis.getRedisKey('follow:counts', followedUserId);
    const followerKey = redis.getRedisKey('follow:counts', followerId);
    await Promise.all([
      redis.removeFromRedisAsync(followedKey),
      redis.removeFromRedisAsync(followerKey),
      this.profileCache.invalidateProfile(followedUserId),
      this.profileCache.invalidateProfile(followerId),
    ]);
  }
}
