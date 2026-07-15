import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserContent,
  PlaylistMember,
  UserFollow,
  User,
} from '../domain/entities';
import { dependency } from '../infrastructure/dependency';
import discover from '../features/discover';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([UserContent, PlaylistMember, UserFollow, User]),
  ],
  controllers: [...discover.addControllers()],
  providers: [
    ...discover.addHandlers(),
    dependency.UserContentRepository,
    dependency.UserFollowRepository,
  ],
})
export class DiscoverModule {}
