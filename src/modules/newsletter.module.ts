import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsletterSubscriber } from '../domain/entities/newsletterSubscriber.entity';
import { dependency } from '../infrastructure/dependency';
import newsletter from '../features/newsletter';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([NewsletterSubscriber])],
  controllers: [...newsletter.addControllers()],
  providers: [...newsletter.addHandlers(), dependency.NewsletterRepository],
  exports: [],
})
export class NewsletterModule {}
