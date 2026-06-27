import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { FollowStatus } from "../../../../domain/enums";
import { IUserFollowRepository } from "../../../../domain/repositories/iuserFollow.repository";
import redis from "../../../../core/utils/redis.util";

export class ApproveFollowRequestCommand {
  constructor(
    public followedUserId: string,
    public followerId: string,
  ) { }
}

@CommandHandler(ApproveFollowRequestCommand)
export class ApproveFollowRequestCommandHandler implements ICommandHandler<ApproveFollowRequestCommand> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(command: ApproveFollowRequestCommand): Promise<void> {
    const existing = await this.follows.getAsync(command.followerId, command.followedUserId);
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
  }

  private async invalidateCaches(followedUserId: string, followerId: string): Promise<void> {
    const followedKey = redis.getRedisKey('follow:counts', followedUserId);
    const followerKey = redis.getRedisKey('follow:counts', followerId);
    const followedProfileKey = redis.getRedisKey('profile', `public:${followedUserId}`);
    const followerProfileKey = redis.getRedisKey('profile', `public:${followerId}`);
    await Promise.all([
      redis.removeFromRedisAsync(followedKey),
      redis.removeFromRedisAsync(followerKey),
      redis.removeFromRedisAsync(followedProfileKey),
      redis.removeFromRedisAsync(followerProfileKey),
    ]);
  }
}
