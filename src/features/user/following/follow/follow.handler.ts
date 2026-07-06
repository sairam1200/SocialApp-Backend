import {
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FollowModel } from '../../../../domain/contracts/follow.model';
import { FollowStatus } from '../../../../domain/enums';
import { UserFollow } from '../../../../domain/entities/userFollow.entity';
import { mapToFollowModel } from '../../../../domain/mappers/follow.mapper';
import { FollowUpdatedEvent } from '../../../../domain/events/follow-updated.event';
import _const from '../../../../core/utils/const';
import {
  IUserRepository,
  IUserFollowRepository,
} from '../../../../domain/repositories';
import { ProfileCacheService } from '../../../../infrastructure/services/profileCache.service';
import configs from '../../../../configs';
import { TooManyRequestsException } from '../../../../core/exceptions/tooManyRequest.exception';
import redis from '../../../../core/utils/redis.util';

export class FollowUserCommand {
  constructor(
    public followerId: string,
    public targetUserId: string,
  ) {}
}

@CommandHandler(FollowUserCommand)
export class FollowUserCommandHandler
  implements ICommandHandler<FollowUserCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
    private readonly profileCache: ProfileCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private getDailyFollowLimitKey(userId: string): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return redis.getRedisKey('follow', `daily:limit:${userId}:${dateStr}`);
  }

  private async checkDailyFollowLimit(userId: string): Promise<void> {
    const limit = configs.user.dailyFollowLimit;
    const key = this.getDailyFollowLimitKey(userId);
    try {
      const count = await redis.incrementInRedisAsync(key, 25 * 60 * 60);
      if (count > limit) {
        throw new TooManyRequestsException(
          'Daily follow limit reached. Please try again later.',
        );
      }
    } catch (error) {
      if (error instanceof TooManyRequestsException) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('READONLY')) {
        throw new TooManyRequestsException(
          'Daily follow limit reached. Please try again later.',
        );
      }
    }
  }

  public async execute(command: FollowUserCommand): Promise<FollowModel> {
    if (command.followerId === command.targetUserId) {
      throw new BadRequestException('You cannot follow yourself.');
    }

    const targetUser = await this.users.getUserByIdAsync(command.targetUserId);
    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundException('User not found.');
    }

    await this.checkDailyFollowLimit(command.followerId);

    const existing = await this.follows.getWithUsersAsync(
      command.followerId,
      command.targetUserId,
    );
    if (existing) {
      if (existing.status === FollowStatus.Blocked) {
        throw new ForbiddenException('You cannot follow this user.');
      }
      return mapToFollowModel(existing);
    }

    await this.follows.createAsync(
      new UserFollow({
        followerId: command.followerId,
        followedId: command.targetUserId,
        status: FollowStatus.Accepted,
      }),
    );

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
        true,
        targetFollowersCount,
        viewerFollowingCount,
      ),
    );

    const hydrated = await this.follows.getWithUsersAsync(
      command.followerId,
      command.targetUserId,
    );
    return mapToFollowModel(
      hydrated ??
        new UserFollow({
          followerId: command.followerId,
          followedId: command.targetUserId,
          status: FollowStatus.Accepted,
        }),
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
