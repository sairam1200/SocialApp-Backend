import { Inject, NotFoundException } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

const PLATFORM = 'instagram';
export class InstagramImportCommand {
  
  constructor(request: Partial<InstagramImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramImportCommand)
export class InstagramImportCommandHandler implements ICommandHandler<InstagramImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(query: InstagramImportCommand): Promise<void> {

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      PLATFORM,
      HttpContext.user[Globals.ClaimTypes.UserId]
    );

    if (!account) {
      throw new NotFoundException("No matching Instagram profile was found!");
    }


  }
}