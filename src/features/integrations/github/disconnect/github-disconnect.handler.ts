import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class GithubDisconnectCommand {
  constructor(request: Partial<GithubDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(GithubDisconnectCommand)
export class GithubDisconnectCommandHandler implements ICommandHandler<GithubDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) {}

  public async execute(command: GithubDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(
      userId,
      _const.PLATFORMS.GITHUB,
    );
  }
}
