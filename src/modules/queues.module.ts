import configs from "../configs";
import { Queue } from "bullmq";
import _const from "../core/utils/const";
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
import { FacebookImportProcessor, InjectFacebookImportQueue } from "../infrastructure/background/processors/facebook-import.processor";
import { JwtService } from "@nestjs/jwt";

@Module({})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
    const { host, port, password } = configs.Redis;

    return {
      module: QueuesModule,
      imports: [
        NotificationModule,
        TypeOrmModule.forFeature([Notification, UserContent, LinkedAccount]),
        BullModule.forRoot({
          connection: {
            host,
            port: parseInt(port),
            password,
          },
          prefix: 'gaddr-backend',
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 3000,
            },
          },
        }),
        BullModule.registerQueue({
          name: _const.BULL_QUEUES.FACEBOOK_IMPORT,
        }),
      ],
      providers: [
        JwtService,

        FacebookImportProcessor,
        ImportGateway,

        dependency.UserContentRepository,
      ],
      exports: [
        FacebookImportProcessor,
      ],
    };
  }

  constructor(
    @InjectFacebookImportQueue() private readonly facebookImportQueue: Queue,
  ) { }

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/background/queues');

    createBullBoard({
      queues: [
        new BullMQAdapter(this.facebookImportQueue),
      ],
      serverAdapter,
    });

    consumer
      .apply(BullBoardAuthMiddleware, serverAdapter.getRouter())
      .forRoutes('/background/queues');
  }
}