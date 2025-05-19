import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { PinterestProfileModel } from "../../../../domain/contracts/pinterest.model";
import { mapToPinterestProfileModel } from "../../../../domain/mappers/pinterest.mapper";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

const PLATFORM = 'pinterest';
export class PinterestProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    pinterestId?: string;
  }

  constructor(request: Partial<PinterestProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(PinterestProfileQuery)
export class PinterestProfileQueryHandler implements ICommandHandler<PinterestProfileQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: PinterestProfileQuery): Promise<PinterestProfileModel> {

    const { model } = command;

    const account = model.userId ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(PLATFORM, model.userId)
      : model.userName ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(PLATFORM, model.userName)
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(PLATFORM, model.pinterestId);

    if (!account) {
      throw new NotFoundException("No matching Pinterest profile was found based on the provided information.");
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? (account.userId === HttpContext.user[Globals.ClaimTypes.UserId]
        || HttpContext.user.permission.some(a => a === "viewuser")) : false;

    return mapToPinterestProfileModel(account, includeSensitiveFields);
  }
}