import configs from '../configs';
import { JwtModule } from '@nestjs/jwt';
import _const from '../core/utils/const';
import redis from '../core/utils/redis.util';
import logger from '../core/utils/winston.util';
import { IdentityAccessModule } from './identityAccess.module';
import { UserModule } from './user.module';
import { RoleModule } from './role.module';
import { AuthModule } from './auth.module';
import { QueuesModule } from './queues.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileModule } from './profile.module';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { PlaylistModule } from './playlist.module';
import { IntegrationsModule } from './integrations.module';
import { NotificationModule } from './notification.module';
import { FollowModule } from './follow.module';
import { AnalyticsModule } from './analytics.module';
import { DiscoverModule } from './discover.module';
import { NewsletterModule } from './newsletter.module';
import { ProjectModule } from './project.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataSeeder } from '../infrastructure/services/data.seeder';
import { postgresOptions } from '../infrastructure/persistence/data.source';
import { HttpContextMiddleware } from '../core/middlewares/httpContext.middleware';
import { RateLimitMiddleware } from '../core/middlewares/rate-limit.middleware';
import { RateLimit, RateLimitLog } from '../domain/entities';
import { dependency } from '../infrastructure/dependency';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

@Module({
  imports: [
    // Global: the account guards read the database on a session-cache miss, and Nest
    // resolves a guard's dependencies where the guard is *used* — across a dozen feature
    // modules. See identityAccess.module.ts.
    IdentityAccessModule,
    PassportModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    JwtModule.register({
      secret: configs.jwt.secret,
      signOptions: { expiresIn: configs.jwt.accessTokenExpiration },
    }),
    TypeOrmModule.forRoot(postgresOptions),
    TypeOrmModule.forFeature([RateLimit, RateLimitLog]),
    UserModule,
    RoleModule,
    AuthModule,
    ProfileModule,
    PlaylistModule,
    QueuesModule.register(),
    NotificationModule,
    IntegrationsModule,
    FollowModule,
    AnalyticsModule,
    DiscoverModule,
    NewsletterModule,
    ProjectModule,
  ],
  providers: [dependency.RateLimitRepository, RateLimitMiddleware],
})
export class AppModule
  implements OnApplicationBootstrap, OnApplicationShutdown, NestModule
{
  constructor(private readonly dataSeeder: DataSeeder) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpContextMiddleware).forRoutes('*');

    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }

  async onApplicationBootstrap(): Promise<void> {
    //await this.dataSeeder.initializeAsync();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    logger.info(`Application shutting down (signal: ${signal})`);
    await redis.disconnectFromRedis();
  }
}
