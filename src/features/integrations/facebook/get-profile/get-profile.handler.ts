import { Inject, NotFoundException } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { FacebookProfileModel } from "../../../../domain/contracts/facebook.model";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { mapToFacebookProfileModel } from "domain/mappers/facebook.mapper";

const PLATFORM = 'facebook';
export class FacebookProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    facebookId?: string;
  }

  constructor(request: Partial<FacebookProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(FacebookProfileQuery)
export class FacebookProfileQueryHandler implements ICommandHandler<FacebookProfileQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: FacebookProfileQuery): Promise<FacebookProfileModel> {

    const { model } = command;

    const account = model.userId ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(PLATFORM, model.userId)
      : model.userName ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(PLATFORM, model.userName)
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(PLATFORM, model.facebookId);

    if (!account) {
      throw new NotFoundException("No matching Facebook profile was found based on the provided information.");
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? (account.userId === HttpContext.user[Globals.ClaimTypes.UserId]
        || HttpContext.user.permission.some(a => a === "viewuser")) : false;

    return mapToFacebookProfileModel(account, includeSensitiveFields);
  }
}