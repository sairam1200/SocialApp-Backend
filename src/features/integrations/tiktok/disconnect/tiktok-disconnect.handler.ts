import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class TiktokDisconnectCommand {
  constructor(request: Partial<TiktokDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TiktokDisconnectCommand)
export class TiktokDisconnectCommandHandler
  implements ICommandHandler<TiktokDisconnectCommand>
{
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: TiktokDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.TIKTOK,
    );
  }
}
