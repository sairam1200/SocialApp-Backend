import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class TwitchDisconnectCommand {
  constructor(request: Partial<TwitchDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TwitchDisconnectCommand)
export class TwitchDisconnectCommandHandler implements ICommandHandler<TwitchDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: TwitchDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.TWITCH,
    );
  }
}
