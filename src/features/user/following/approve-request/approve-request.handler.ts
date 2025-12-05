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
    await this.invalidateFollowCounts(command.followedUserId);
    await this.invalidateFollowCounts(command.followerId);
  }

  private async invalidateFollowCounts(userId: string): Promise<void> {
    const key = redis.getRedisKey('follow:counts', userId);
    await redis.removeFromRedisAsync(key);
  }
}
