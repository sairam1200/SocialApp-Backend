import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from "@nestjs/typeorm";
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { NotificationModule } from "./notification.module";
import { UserContent } from "../domain/entities/userContent.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity";
import { YoutubeAccount, YoutubeVideo, YoutubeAnalytic, UploadJob } from "../domain/entities";
import { BullBoardAuthMiddleware } from "../core/middlewares/bullBoardAuth.middleware";
import { DynamicModule, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import BullMQConfig from "../core/config/bullmq.config";
import { YoutubeImportProcessor } from "../infrastructure/background/processors/youtube-import.processor";
import { YoutubeUploadProcessor } from "../infrastructure/background/processors/youtube-upload.processor";
import { YoutubeAnalyticsSyncProcessor } from "../infrastructure/background/processors/youtube-analytics-sync.processor";
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
@Module({})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
    return {
      module: QueuesModule,
      imports: [
        NotificationModule,
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
          YoutubeAnalytic,
          UploadJob,
        ]),
        BullModule.forRoot({
          ...BullMQConfig.getConnectionConfig(),
          prefix: 'gaddr-backend',
          defaultJobOptions: BullMQConfig.getDefaultJobOptions(),
        }),
        BullModule.registerQueue(
          {
            name: _const.BULL_QUEUES.FACEBOOK_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.FACEBOOK_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.INSTAGRAM_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.INSTAGRAM_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.YOUTUBE_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.YOUTUBE_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.SPOTIFY_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.SPOTIFY_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.PINTEREST_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.PINTEREST_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.REDDIT_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.REDDIT_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.TWITTER_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.TWITTER_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.TIKTOK_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.TIKTOK_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.LINKEDIN_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.LINKEDIN_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.SNAPCHAT_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.SNAPCHAT_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.THREADS_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.THREADS_IMPORT),
          },
          {
            name: _const.BULL_QUEUES.BEHANCE_IMPORT,
            ...BullMQConfig.getQueueOptions(_const.BULL_QUEUES.BEHANCE_IMPORT),
          },
        ),
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
        dependency.YoutubeAnalyticRepository,
        dependency.UploadJobRepository,
        dependency.YoutubePublishingService,
        dependency.YoutubeAnalyticsService,

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
        YoutubeAnalyticsSyncProcessor,
      ],
      exports: [
        dependency.QueueService,
      ]
    };
  }

  constructor() { }

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