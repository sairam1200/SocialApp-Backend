import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import redis from "core/utils/redis.util";
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from "@nestjs/typeorm";
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { NotificationModule } from "./notification.module";
import { UserContent } from "../domain/entities/userContent.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity"; 
import { Notification } from "../domain/entities/notification/notification.entity";
import { BullBoardAuthMiddleware } from "../core/middlewares/bullBoardAuth.middleware";
import { DynamicModule, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
@Module({})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
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
      ],
      providers: [
        JwtService,
      ],
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