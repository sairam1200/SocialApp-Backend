import { Project } from '../entities';
import { PagedResult } from '../contracts/pagination/pagedResult';

export type ProjectSearchFilters = {
  keyword?: string;
  status?: string;
  projectType?: string;
};

export interface IProjectRepository {
  searchAsync(
    filters: ProjectSearchFilters,
    page: number,
    limit: number,
  ): Promise<PagedResult<Project[]>>;

  searchSuggestionsAsync(
    keyword: string,
    limit: number,
  ): Promise<Pick<Project, 'id' | 'title' | 'description' | 'status'>[]>;
}
