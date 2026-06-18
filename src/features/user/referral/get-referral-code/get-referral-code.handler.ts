import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories";
import { UserNotFoundException } from "../../../../core/exceptions/user.exception";

export class GetReferralCodeQuery {
  constructor() { }
}

@CommandHandler(GetReferralCodeQuery)
export class GetReferralCodeQueryHandler implements ICommandHandler<GetReferralCodeQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: GetReferralCodeQuery): Promise<{ referralCode: string }> {

    const userId = HttpContext.getCurrentUserId;
    if (!userId) {
      throw new UserNotFoundException();
    }

    const user = await this.userRepository.getUserByIdAsync(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    // If user doesn't have a referral code yet, generate one
    if (!user.referralCode) {
      const code = await this.userRepository.generateReferralCodeAsync(user);
      return { referralCode: code };
    }

    return { referralCode: user.referralCode };
  }
}
