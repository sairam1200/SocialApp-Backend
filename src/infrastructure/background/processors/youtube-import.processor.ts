import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";

interface CursorMap {
  [key: string]: string | null;
}

export const InjectYoutubeImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.YOUTUBE_IMPORT);

@Processor(_const.BULL_QUEUES.YOUTUBE_IMPORT)
export class YoutubeImportProcessor extends WorkerHost {

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    private readonly gateway: ImportGateway,
  ) { super() }

  async process(job: Job<{ account: LinkedAccount, accessToken: string }>): Promise<void> {
    const { account, accessToken } = job.data
    const lastCursors: CursorMap = {};

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        progressPercent: number;
      };
    } = {};

  }

}