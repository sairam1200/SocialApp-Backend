import { Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../core/utils/const";
import { FollowStatus } from "../../../domain/enums";
import { FollowActionResultModel } from "../../../domain/contracts/follow.model";
import { IUserFollowRepository } from "../../../domain/repositories/iuserFollow.repository";

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

  public async execute(command: ApproveFollowRequestCommand): Promise<FollowActionResultModel> {
    const existing = await this.follows.getAsync(command.followerId, command.followedUserId);
    if (!existing) {
      throw new NotFoundException('Follow request not found.');
    }

    if (existing.followedId !== command.followedUserId) {
      throw new BadRequestException('You cannot approve this request.');
    }

    if (existing.status === FollowStatus.Accepted) {
      return { succeeded: true };
    }

    if (existing.status === FollowStatus.Blocked) {
      throw new BadRequestException('This follow is blocked.');
    }

    await this.follows.updateStatusAsync(existing.id, FollowStatus.Accepted);
    return { succeeded: true };
  }
}
