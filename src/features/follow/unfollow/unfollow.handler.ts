import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../core/utils/const";
import { FollowActionResultModel } from "../../../domain/contracts/follow.model";
import { IUserFollowRepository } from "../../../domain/repositories/iuserFollow.repository";

export class UnfollowUserCommand {
  constructor(
    public followerId: string,
    public targetUserId: string,
  ) { }
}

@CommandHandler(UnfollowUserCommand)
export class UnfollowUserCommandHandler implements ICommandHandler<UnfollowUserCommand> {
  constructor(
    @Inject(_const.IUSERFOLLOW_REPOSITORY) private readonly follows: IUserFollowRepository,
  ) { }

  public async execute(command: UnfollowUserCommand): Promise<FollowActionResultModel> {
    const existing = await this.follows.getAsync(command.followerId, command.targetUserId);
    if (!existing) {
      throw new NotFoundException('Follow relationship not found.');
    }

    await this.follows.deleteAsync(existing);
    return { succeeded: true };
  }
}
