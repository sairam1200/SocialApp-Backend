import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from '../../domain/entities';
import {
  IProjectRepository,
  ProjectSearchFilters,
} from '../../domain/repositories/iproject.repository';
import { PagedResult } from '../../domain/contracts/pagination/pagedResult';

@Injectable()
export class ProjectRepository implements IProjectRepository {
  constructor(
    @InjectRepository(Project)
    private readonly projectContext: Repository<Project>,
  ) {}

  public async searchAsync(
    filters: ProjectSearchFilters,
    page: number,
    limit: number,
  ): Promise<PagedResult<Project[]>> {
    const qb = this.projectContext.createQueryBuilder('project');

    if (filters.keyword && filters.keyword.trim()) {
      const keyword = `%${filters.keyword.trim()}%`;
      const rawKeyword = filters.keyword.trim();
      qb.where(
        `(project.title ILIKE :keyword OR project.description ILIKE :keyword OR :rawKeyword = ANY(project.skills))`,
        { keyword, rawKeyword },
      );
    }

    if (filters.status) {
      qb.andWhere('project.status = :status', { status: filters.status });
    }

    if (filters.projectType) {
      qb.andWhere('project.projectType = :projectType', {
        projectType: filters.projectType,
      });
    }

    qb.andWhere('project.isConfidential = :confidential', {
      confidential: false,
    });

    const total = await qb.getCount();
    const results = await qb
      .orderBy('project.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return new PagedResult(results, total);
  }

  public async searchSuggestionsAsync(
    keyword: string,
    limit: number,
  ): Promise<Pick<Project, 'id' | 'title' | 'description' | 'status'>[]> {
    const likeKeyword = `%${keyword.trim()}%`;
    return this.projectContext
      .createQueryBuilder('project')
      .where(
        '(project.title ILIKE :keyword OR project.description ILIKE :keyword)',
        { keyword: likeKeyword },
      )
      .andWhere('project.isConfidential = :confidential', { confidential: false })
      .select(['project.id', 'project.title', 'project.description', 'project.status'])
      .orderBy('project.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
