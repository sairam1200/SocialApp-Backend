import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import playlist from '../features/playlist';
import { TypeOrmModule } from '@nestjs/typeorm';
import bookmark from '../features/playlist/bookmark';
import { dependency } from '../infrastructure/dependency';
import { NotificationModule } from './notification.module';
import { AnalyticsModule } from './analytics.module';
import {
  Playlist,
  PlaylistContent,
  PlaylistMember,
  Role,
  User,
  UserContent,
  UserRole,
  ContentStream,
} from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    AnalyticsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      UserRole,
      Playlist,
      PlaylistMember,
      PlaylistContent,
      UserContent,
      ContentStream,
    ]),
  ],
  controllers: [...playlist.addControllers(), ...bookmark.addControllers()],
  providers: [
    JwtService,

    ...playlist.addHandlers(),
    ...bookmark.addHandlers(),
    dependency.PlaylistRepository,
    dependency.ContentStreamRepository,
    dependency.UserContentRepository,
  ],
  exports: [],
})
export class PlaylistModule {}
