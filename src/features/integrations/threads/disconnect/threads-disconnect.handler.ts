import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class ThreadsDisconnectCommand {
  constructor(request: Partial<ThreadsDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(ThreadsDisconnectCommand)
export class ThreadsDisconnectCommandHandler implements ICommandHandler<ThreadsDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: ThreadsDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.THREADS,
    );
  }
}
