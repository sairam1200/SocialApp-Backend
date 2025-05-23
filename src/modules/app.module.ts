import configs from '../configs';
import { JwtModule } from '@nestjs/jwt';
import _const from '../core/utils/const';
import { UserModule } from './user.module';
import { RoleModule } from './role.module';
import { AuthModule } from './auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { IntegrationsModule } from './integrations.module';
import { NotificationModule } from './notification.module';
import { DataSeeder } from '../infrastructure/services/data.seeder';
import { postgresOptions } from '../infrastructure/persistence/data.source';
import { HttpContextMiddleware } from '../core/middlewares/httpContext.middleware';
import { MiddlewareConsumer, Module, NestModule, OnApplicationBootstrap } from '@nestjs/common';

@Module({
  imports: [PassportModule,
    JwtModule.register({
      secret: configs.jwt.secret,
      signOptions: { expiresIn: configs.jwt.accessTokenExpiration },
    }),
    TypeOrmModule.forRoot(postgresOptions),
    UserModule,
    RoleModule,
    AuthModule,
    NotificationModule,
    IntegrationsModule,
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