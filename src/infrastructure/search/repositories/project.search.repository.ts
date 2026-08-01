import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import {
  ISearchRepository,
  SearchRepositoryCapabilities,
  SearchRepositoryQuery,
} from '../../../domain/contracts/search/search-repository.interface';
import { IProjectRepository } from '../../../domain/repositories/iproject.repository';
import { Project } from '../../../domain/entities/project.entity';

/**
 * Project repository. Wraps IProjectRepository.searchAsync, which already
 * filters confidential projects out.
 */
@Injectable()
export class ProjectSearchRepository implements ISearchRepository {
  readonly name = 'project';
  readonly capabilities: SearchRepositoryCapabilities = {
    supports: ['exact', 'privacy', 'pagination'],
  };

  constructor(
    @Inject(_const.IPROJECT_REPOSITORY)
    private readonly projectRepository: IProjectRepository,
  ) {}

  async search(query: SearchRepositoryQuery): Promise<IndexDocument[]> {
    if (!query.normalizedQuery) return [];
    if (
      query.entityType !== undefined &&
      query.entityType !== SearchEntityType.PROJECT
    ) {
      return [];
    }

    const paged = await this.projectRepository.searchAsync(
      { keyword: query.normalizedQuery },
      1,
      query.limit,
    );

    return paged.result.map((project) =>
      this.toIndexDocument(project, query.normalizedQuery),
    );
  }

  private toIndexDocument(project: Project, query: string): IndexDocument {
    const textRelevance = this.deriveTextRelevance(project, query);

    return {
      id: String(project.id),
      type: SearchEntityType.PROJECT,
      subType: project.projectType || 'open',
      title: project.title,
      description: project.description ?? '',
      publishedAt: project.createdAt,
      updatedAt: project.updatedAt,
      platform: 'gaddr',
      externalId: String(project.id),
      engagementScore: 0,
      ranking: {
        textRelevance,
        textSimilarity: textRelevance,
        exactMatch: textRelevance >= 100,
      },
      metadata: { ...project },
    };
  }

  private deriveTextRelevance(project: Project, query: string): number {
    const q = query.toLowerCase();
    const title = project.title.toLowerCase();

    if (title === q) return 100;
    if (title.startsWith(q)) return 80;
    return 50;
  }
}
