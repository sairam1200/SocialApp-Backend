import configs from '../configs';
import { JwtModule } from '@nestjs/jwt';
import _const from '../core/utils/const';
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
import { DataSeeder } from '../infrastructure/services/data.seeder';
import { postgresOptions } from '../infrastructure/persistence/data.source';
import { HttpContextMiddleware } from '../core/middlewares/httpContext.middleware';
import { MiddlewareConsumer, Module, NestModule, OnApplicationBootstrap } from '@nestjs/common';

@Module({
  imports: [
    PassportModule,
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: configs.jwt.secret,
      signOptions: { expiresIn: configs.jwt.accessTokenExpiration },
    }),
    TypeOrmModule.forRoot(postgresOptions),
    UserModule,
    RoleModule,
    AuthModule,
    ProfileModule,
    PlaylistModule,
    QueuesModule.register(),
    NotificationModule,
    IntegrationsModule,
    FollowModule,
  ],
})
export class AppModule implements OnApplicationBootstrap, NestModule {
  constructor(
    private readonly dataSeeder: DataSeeder
  ) { }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HttpContextMiddleware)
      .forRoutes('*');
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.dataSeeder.initializeAsync();
  }
} 
