import { Inject, BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { FollowModel } from "../../../../domain/contracts/follow.model";
import { FollowStatus } from "../../../../domain/enums";
import { UserFollow } from "../../../../domain/entities/userFollow.entity";
import { mapToFollowModel } from "../../../../domain/mappers/follow.mapper";
import _const from "../../../../core/utils/const";
import { IUserRepository, IUserFollowRepository } from "../../../../domain/repositories";
import redis from "../../../../core/utils/redis.util";

export class FollowUserCommand {
  constructor(
    public followerId: string,
    public targetUserId: string,
  ) { }
}

@CommandHandler(FollowUserCommand)
export class FollowUserCommandHandler implements ICommandHandler<FollowUserCommand> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(command: FollowUserCommand): Promise<FollowModel> {
    if (command.followerId === command.targetUserId) {
      throw new BadRequestException('You cannot follow yourself.');
    }

    const targetUser = await this.users.getUserByIdAsync(command.targetUserId);
    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundException('User not found.');
    }

    const existing = await this.follows.getWithUsersAsync(command.followerId, command.targetUserId);
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
        status: FollowStatus.Accepted, // hook here if/when private profiles are added
      })
    );

    // Invalidate follow count caches for both users
    await this.invalidateFollowCounts(command.targetUserId);
    await this.invalidateFollowCounts(command.followerId);

    const hydrated = await this.follows.getWithUsersAsync(command.followerId, command.targetUserId);
    return mapToFollowModel(hydrated ?? new UserFollow({
      followerId: command.followerId,
      followedId: command.targetUserId,
      status: FollowStatus.Accepted
    }));
  }

  private async invalidateFollowCounts(userId: string): Promise<void> {
    const key = redis.getRedisKey('follow:counts', userId);
    await redis.removeFromRedisAsync(key);
  }
}
