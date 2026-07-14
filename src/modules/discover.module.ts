import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserContent, PlaylistMember } from '../domain/entities';
import { dependency } from '../infrastructure/dependency';
import discover from '../features/discover';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([UserContent, PlaylistMember])],
  controllers: [...discover.addControllers()],
  providers: [...discover.addHandlers(), dependency.UserContentRepository],
})
export class DiscoverModule {}
