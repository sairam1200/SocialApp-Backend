import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class InstagramDisconnectCommand {
  constructor(request: Partial<InstagramDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramDisconnectCommand)
export class InstagramDisconnectCommandHandler
  implements ICommandHandler<InstagramDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) { }

  public async execute(command: InstagramDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(userId, _const.PLATFORMS.INSTAGRAM);
  }
}

