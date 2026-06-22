import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';

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
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) { }

  public async execute(command: YoutubeDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    await this.disconnectService.disconnectPlatformAsync(userId, _const.PLATFORMS.YOUTUBE);

    const youtubeAccount = await this.youtubeAccountRepository.getByUserIdAsync(userId);
    if (youtubeAccount) {
      youtubeAccount.connected = false;
      youtubeAccount.disconnectedAt = new Date();
      await this.youtubeAccountRepository.updateAsync(youtubeAccount);
      logger.info(`[YoutubeDisconnect] Account ${youtubeAccount.channelId} marked as disconnected`);
    }
  }
}