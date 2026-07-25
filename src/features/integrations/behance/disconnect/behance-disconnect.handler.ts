import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class BehanceDisconnectCommand {
  constructor(request: Partial<BehanceDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(BehanceDisconnectCommand)
export class BehanceDisconnectCommandHandler implements ICommandHandler<BehanceDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: BehanceDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.BEHANCE,
    );
  }
}
