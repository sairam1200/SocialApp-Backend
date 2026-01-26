import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { SnapchatProfileModel } from "../../../../domain/contracts/snapchat.model";
import { mapToSnapchatProfileModel } from "../../../../domain/mappers/snapchat.mapper";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

const PLATFORM = _const.PLATFORMS.SNAPCHAT;
export class SnapchatProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    snapchatId?: string;
  }

  constructor(request: Partial<SnapchatProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SnapchatProfileQuery)
export class SnapchatProfileQueryHandler implements ICommandHandler<SnapchatProfileQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(query: SnapchatProfileQuery): Promise<SnapchatProfileModel> {

    const { model } = query;

    const account = model.userId ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(PLATFORM, model.userId)
      : model.userName ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(PLATFORM, model.userName)
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(PLATFORM, model.snapchatId);

    if (!account) {
      throw new NotFoundException("No matching Snapchat profile was found based on the provided information.");
    }

    const includeSensitiveFields = HttpContext.user
      ? (account.userId === HttpContext.user[Globals.ClaimTypes.UserId]
        || HttpContext.user.permission.some(a => a === "viewuser")) : false;

    return mapToSnapchatProfileModel(account, includeSensitiveFields);
  }
}
