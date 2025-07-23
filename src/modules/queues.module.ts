import { Queue } from "bullmq";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import redis from "core/utils/redis.util";
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from "@nestjs/typeorm";
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { UserContent } from "../domain/entities/userContent.entity";
import { Notification } from "../domain/entities/notification.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { BullBoardAuthMiddleware } from "../core/middlewares/bullBoardAuth.middleware";
import { DynamicModule, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { EmailProcessor, InjectEmailQueue } from "../infrastructure/background/processors/email.processor";
import { InjectSpotifyImportQueue, SpotifyImportProcessor } from "../infrastructure/background/processors/spotify-import.processor";
import { InjectYoutubeImportQueue, YoutubeImportProcessor } from "../infrastructure/background/processors/youtube-import.processor";
import { FacebookImportProcessor, InjectFacebookImportQueue } from "../infrastructure/background/processors/facebook-import.processor";
import { InjectPinterestImportQueue, PinterestImportProcessor } from "../infrastructure/background/processors/pinterest-import.processor";
import { InjectInstagramImportQueue, InstagramImportProcessor } from "../infrastructure/background/processors/instagram-import.processor";
import { RedditImportProcessor, InjectRedditImportQueue } from "../infrastructure/background/processors/reddit-import.processor";
import { InjectTwitterImportQueue,TwitterImportProcessor } from "../infrastructure/background/processors/twitter-import.processor";
@Module({})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
    const queues = BullModule.registerQueue(
      {
        name: _const.BULL_QUEUES.FACEBOOK_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.YOUTUBE_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.PINTEREST_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.SPOTIFY_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.INSTAGRAM_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.TWITTER_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.EMAIL,
      },
      {
        name: _const.BULL_QUEUES.REDDIT_IMPORT,
      },
      {
        name: _const.BULL_QUEUES.TIKTOK_IMPORT,
      }
    );

    return {
      module: QueuesModule,
      imports: [
        NotificationModule,
        TypeOrmModule.forFeature([Notification, UserContent, LinkedAccount]),
        BullModule.forRoot({
          connection: redis.instance,
          prefix: 'gaddr-backend',
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 3000,
            },
          },
        }),
        queues
      ],
      providers: [
        JwtService,
        ...queues.providers,

        PinterestImportProcessor,
        InstagramImportProcessor,
        FacebookImportProcessor,
        YoutubeImportProcessor,
        TwitterImportProcessor,
        SpotifyImportProcessor,
        RedditImportProcessor,
        // TikTokImportProcessor,
        EmailProcessor,
        ImportGateway,

        dependency.UserContentRepository,
        dependency.LinkedAccountRepository,
      ],
      exports: [
        InstagramImportProcessor,
        PinterestImportProcessor,
        FacebookImportProcessor,
        YoutubeImportProcessor,
        RedditImportProcessor,
        // TikTokImportProcessor,
        ...queues.exports,
        EmailProcessor,
      ],
    };
  }

  constructor(
    @InjectPinterestImportQueue() private readonly pinterestImportQueue: Queue,
    @InjectInstagramImportQueue() private readonly instagramImportQueue: Queue,
    @InjectFacebookImportQueue() private readonly facebookImportQueue: Queue,
    @InjectYoutubeImportQueue() private readonly youtubeImportQueue: Queue,
    @InjectSpotifyImportQueue() private readonly spotifyImportQueue: Queue,
    @InjectRedditImportQueue() private readonly redditImportQueue: Queue,
    @InjectTwitterImportQueue() private readonly twitterImportQueue: Queue,
    @InjectEmailQueue() private readonly emailQueue: Queue,
  ) { }

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/background/queues');

    createBullBoard({
      queues: [
        new BullMQAdapter(this.facebookImportQueue),
        new BullMQAdapter(this.youtubeImportQueue),
        new BullMQAdapter(this.instagramImportQueue),
        new BullMQAdapter(this.redditImportQueue),
        // new BullMQAdapter(this.tiktokImportQueue),
        new BullMQAdapter(this.emailQueue),
      ],
      serverAdapter,
    });

    consumer
      .apply(BullBoardAuthMiddleware, serverAdapter.getRouter())
      .forRoutes('/background/queues');
  }
}