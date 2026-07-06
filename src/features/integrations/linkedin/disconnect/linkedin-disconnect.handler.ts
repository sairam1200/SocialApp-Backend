import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class LinkedInDisconnectCommand {
  constructor(request: Partial<LinkedInDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(LinkedInDisconnectCommand)
export class LinkedInDisconnectCommandHandler
  implements ICommandHandler<LinkedInDisconnectCommand>
{
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: LinkedInDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.LINKEDIN,
    );
  }
}
