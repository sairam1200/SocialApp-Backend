import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';

export class YoutubeDisconnectCommand {
  constructor(request: Partial<YoutubeDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(YoutubeDisconnectCommand)
export class YoutubeDisconnectCommandHandler
  implements ICommandHandler<YoutubeDisconnectCommand> {
  constructor(
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
  ) { }

  public async execute(command: YoutubeDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(userId, _const.PLATFORMS.YOUTUBE);
  }
}

