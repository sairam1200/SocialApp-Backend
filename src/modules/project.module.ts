import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../domain/entities';
import { dependency } from '../infrastructure/dependency';
import project from '../features/project';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([Project])],
  controllers: [...project.addControllers()],
  providers: [...project.addHandlers(), dependency.ProjectRepository],
  exports: [],
})
export class ProjectModule {}
