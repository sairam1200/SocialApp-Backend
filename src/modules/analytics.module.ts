import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import analytics from '../features/analytics';
import { AuthGuardsModule } from './authGuard.module';
import { AnalyticsEvent, PremiumRollup } from '../domain/entities';
import { PremiumRollupCron } from '../infrastructure/background/cron/jobs/premiumRollup.cron';

@Module({
  imports: [
    CqrsModule,
    AuthGuardsModule,
    TypeOrmModule.forFeature([AnalyticsEvent, PremiumRollup]),
  ],
  controllers: [...analytics.addControllers()],
  providers: [
    JwtService,
    ...analytics.addHandlers(),
    PremiumRollupCron,
    dependency.AnalyticsRepository,
    dependency.PremiumRollupRepository,
    dependency.AnalyticsService,
  ],
  exports: [dependency.AnalyticsService],
})
export class AnalyticsModule {}
