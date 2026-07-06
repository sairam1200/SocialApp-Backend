import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FollowUpdatedEvent } from '../../../../domain/events/follow-updated.event';
import { FollowStatus } from '../../../../domain/enums';
import _const from '../../../../core/utils/const';
import { ProfileCacheService } from '../../../../infrastructure/services/profileCache.service';
import redis from '../../../../core/utils/redis.util';
import { IUserFollowRepository } from '../../../../domain/repositories/iuserFollow.repository';

export class UnfollowUserCommand {
  constructor(
    public followerId: string,
    public targetUserId: string,
  ) {}
}

@CommandHandler(UnfollowUserCommand)
export class UnfollowUserCommandHandler
  implements ICommandHandler<UnfollowUserCommand>
{
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
    private readonly profileCache: ProfileCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(command: UnfollowUserCommand): Promise<void> {
    const existing = await this.follows.getAsync(
      command.followerId,
      command.targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('Follow relationship not found.');
    }

    await this.follows.deleteAsync(existing);
    await this.invalidateCaches(command.targetUserId, command.followerId);

    const [targetFollowersCount, viewerFollowingCount] = await Promise.all([
      this.follows.countFollowersAsync(
        command.targetUserId,
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
        command.targetUserId,
        command.followerId,
        false,
        targetFollowersCount,
        viewerFollowingCount,
      ),
    );
  }

  private async invalidateCaches(
    targetUserId: string,
    followerId: string,
  ): Promise<void> {
    const targetKey = redis.getRedisKey('follow:counts', targetUserId);
    const followerKey = redis.getRedisKey('follow:counts', followerId);
    const targetProfileKey = redis.getRedisKey(
      'profile',
      `public:${targetUserId}`,
    );
    const followerProfileKey = redis.getRedisKey(
      'profile',
      `public:${followerId}`,
    );
    await Promise.all([
      redis.removeFromRedisAsync(targetKey),
      redis.removeFromRedisAsync(followerKey),
      redis.removeFromRedisAsync(targetProfileKey),
      redis.removeFromRedisAsync(followerProfileKey),
    ]);
  }
}
