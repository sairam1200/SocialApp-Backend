import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { BullModule, WorkerHost } from '@nestjs/bullmq';
import { Logger } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { DiscoveryModule, DiscoveryService } from "@nestjs/core";
import { UserContent } from "../domain/entities/userContent.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity";
import { YoutubeAccount, YoutubeVideo, UploadJob } from "../domain/entities";
import { BullBoardAuthMiddleware } from "../core/middlewares/bullBoardAuth.middleware";
import { DynamicModule, MiddlewareConsumer, Module, NestModule, OnApplicationShutdown, Global } from "@nestjs/common";
import BullMQConfig from "../core/config/bullmq.config";
import { YoutubeImportProcessor } from "../infrastructure/background/processors/youtube-import.processor";
import { YoutubeUploadProcessor } from "../infrastructure/background/processors/youtube-upload.processor";
import { SpotifyImportProcessor } from "../infrastructure/background/processors/spotify-import.processor";
import { PinterestImportProcessor } from "../infrastructure/background/processors/pinterest-import.processor";
import { RedditImportProcessor } from "../infrastructure/background/processors/reddit-import.processor";
import { TwitterImportProcessor } from "../infrastructure/background/processors/twitter-import.processor";
import { TiktokImportProcessor } from "../infrastructure/background/processors/tiktok-import.processor";
import { InstagramImportProcessor } from "../infrastructure/background/processors/instagram-import.processor";
import { FacebookImportProcessor } from "../infrastructure/background/processors/facebook-import.processor";
import { LinkedInImportProcessor } from "../infrastructure/background/processors/linkedin-import.processor";
import { SnapchatImportProcessor } from "../infrastructure/background/processors/snapchat-import.processor";
import { ThreadsImportProcessor } from "../infrastructure/background/processors/threads-import.processor";
import { BehanceImportProcessor } from "../infrastructure/background/processors/behance-import.processor";
import { dependency } from "../infrastructure/dependency";
import { ImportGateway } from "infrastructure/websocket/gateways/import.gateway";
import { ContentStream, DataProtectionKey, Role, User, UserBiometric, UserClaim, UserLogin, UserRole } from "domain/entities";

const logger = new Logger('QueuesModule');

// 14 named queues, all registered globally.
const registeredQueues = BullModule.registerQueue(
  { name: _const.BULL_QUEUES.FACEBOOK_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.FACEBOOK_IMPORT) },
  { name: _const.BULL_QUEUES.INSTAGRAM_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.INSTAGRAM_IMPORT) },
  { name: _const.BULL_QUEUES.YOUTUBE_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.YOUTUBE_IMPORT) },
  { name: _const.BULL_QUEUES.SPOTIFY_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.SPOTIFY_IMPORT) },
  { name: _const.BULL_QUEUES.YOUTUBE_UPLOAD, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.YOUTUBE_UPLOAD) },
  { name: _const.BULL_QUEUES.PINTEREST_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.PINTEREST_IMPORT) },
  { name: _const.BULL_QUEUES.REDDIT_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.REDDIT_IMPORT) },
  { name: _const.BULL_QUEUES.TWITTER_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.TWITTER_IMPORT) },
  { name: _const.BULL_QUEUES.TIKTOK_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.TIKTOK_IMPORT) },
  { name: _const.BULL_QUEUES.LINKEDIN_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.LINKEDIN_IMPORT) },
  { name: _const.BULL_QUEUES.SNAPCHAT_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.SNAPCHAT_IMPORT) },
  { name: _const.BULL_QUEUES.THREADS_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.THREADS_IMPORT) },
  { name: _const.BULL_QUEUES.BEHANCE_IMPORT, ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.BEHANCE_IMPORT) },
);

@Global()
@Module({})
export class QueuesModule implements NestModule, OnApplicationShutdown {
  static register(): DynamicModule {
    // Processors / Workers — only register when DISABLE_WORKERS is NOT set.
    // This allows web-only instances to skip worker creation.
    const enableWorkers = process.env.DISABLE_WORKERS !== 'true';
    if (!enableWorkers) {
      logger.warn('DISABLE_WORKERS=true — Workers will NOT be registered');
    }

    return {
      // Global: exports available in every module without re-importing
      global: true,
      module: QueuesModule,
      imports: [
        DiscoveryModule,
        TypeOrmModule.forFeature([
          User,
          UserRole,
          UserLogin,
          Role,
          UserClaim,
          UserBiometric,
          UserContent,
          LinkedAccount,
          DataProtectionKey,
          ContentStream,
          YoutubeAccount,
          YoutubeVideo,
          UploadJob,
        ]),
        BullModule.forRoot({
          ...BullMQConfig.getConnectionConfig(),
        }),
        registeredQueues,
      ],
      providers: [
        JwtService,
        ImportGateway,

        dependency.QueueService,
        dependency.UserLoginRepository,
        dependency.UserContentRepository,
        dependency.LinkedAccountRepository,
        dependency.ContentStreamRepository,

        dependency.YoutubeAccountRepository,
        dependency.YoutubeVideoRepository,
        dependency.UploadJobRepository,
        dependency.YoutubePublishingService,
        dependency.R2StorageService,

         dependency.YoutubeChannelAnalyticsRepository,
  dependency.YoutubeVideoAnalyticsRepository,
  dependency.YoutubeAnalyticsService,
        
        // Conditionally register workers (processors decorated with @Processor)
        // When DISABLE_WORKERS=true, consumers use this module but no workers run.
        ...(enableWorkers
          ? [
              YoutubeImportProcessor,
              SpotifyImportProcessor,
              PinterestImportProcessor,
              RedditImportProcessor,
              TwitterImportProcessor,
              TiktokImportProcessor,
              InstagramImportProcessor,
              FacebookImportProcessor,
              LinkedInImportProcessor,
              SnapchatImportProcessor,
              ThreadsImportProcessor,
              BehanceImportProcessor,
              YoutubeUploadProcessor,
            ]
          : []),
      ],
      exports: [
        dependency.QueueService,
        registeredQueues,
      ],
    };
  }

  constructor(
    private readonly discoveryService: DiscoveryService,
  ) { }

  async onApplicationShutdown(signal?: string): Promise<void> {
    const providers = this.discoveryService.getProviders();
    const workerHosts = providers
      .map(p => p.instance)
      .filter((instance): instance is WorkerHost => instance instanceof WorkerHost);

    await Promise.all(
      workerHosts.map(async (host) => {
        try {
          await host.worker.close();
        } catch (error) {
          logger.warn(`[QueuesModule] Failed to close worker ${host.constructor.name}: ${(error as Error).message}`);
        }
      })
    );
  }

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/background/queues');

    createBullBoard({
      queues: [],
      serverAdapter,
    });

    consumer
      .apply(BullBoardAuthMiddleware, serverAdapter.getRouter())
      .forRoutes('/background/queues');
  }
}