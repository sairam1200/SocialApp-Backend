import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import _const from '../../core/utils/const';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { IIdentityRepository } from '../../domain/repositories/iidentity.repository';
import { IProjectRepository } from '../../domain/repositories/iproject.repository';
import { SearchCacheService } from '../../infrastructure/services/searchCache.service';
import { ContentStreamSearchRepository } from '../../infrastructure/search/repositories';
import { SearchIdentityResolver } from './search-identity.resolver';

export type SearchSuggestion = {
  id: string;
  type: 'user' | 'userContent' | 'project';
  label: string;
  userName?: string;
  href?: string;
  creatorName?: string;
};

export class SearchSuggestionsQuery {
  keyword: string;
  constructor(request: Partial<SearchSuggestionsQuery> = {}) {
    Object.assign(this, request);
  }
}

const keywordSchema = Joi.string().trim().min(1).max(200).required();
const suggestionsSchema = Joi.object<SearchSuggestionsQuery>({
  keyword: keywordSchema.min(3),
});

@QueryHandler(SearchSuggestionsQuery)
export class SearchSuggestionsQueryHandler implements IQueryHandler<SearchSuggestionsQuery> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    @Inject(_const.IPROJECT_REPOSITORY)
    private readonly projects: IProjectRepository,
    private readonly contents: ContentStreamSearchRepository,
    private readonly identityResolver: SearchIdentityResolver,
    private readonly searchCache: SearchCacheService,
  ) {}

  async execute(
    query: SearchSuggestionsQuery,
  ): Promise<{ suggestions: SearchSuggestion[] }> {
    const value = await suggestionsSchema.validateAsync(query, {
      stripUnknown: true,
    });

    const normalized = value.keyword.toLowerCase();
    const cached = await this.searchCache.getCachedSuggestions(normalized);
    if (cached) {
      return { suggestions: cached as SearchSuggestion[] };
    }

    const viewerId = HttpContext.getCurrentUserId;
    const [contentDocs, [profileRows], projectRows] = await Promise.all([
      this.contents.search({
        originalQuery: value.keyword,
        normalizedQuery: normalized,
        limit: 5,
      }),
      this.users.searchGlobalAsync(value.keyword, viewerId, 1, 5),
      this.projects.searchSuggestionsAsync(value.keyword, 5),
    ]);

    const suggestions: SearchSuggestion[] = [
      ...profileRows.map((user) => ({
        id: user.id,
        type: 'user' as const,
        label:
          `${user.firstName} ${user.lastName}`.trim() || user.userName || '',
        userName: user.userName,
      })),
      ...contentDocs.map((doc) => {
        const identity = this.identityResolver.resolve(doc);
        return {
          id: doc.id,
          type: 'userContent' as const,
          label: this.getContentLabel(doc),
          href: doc.mediaUrl || undefined,
          creatorName: identity?.displayName,
        };
      }),
      ...projectRows.map((project) => ({
        id: String(project.id),
        type: 'project' as const,
        label: project.title || '',
      })),
    ]
      .sort(
        (a, b) =>
          this.rank(a.label, value.keyword) -
            this.rank(b.label, value.keyword) || a.label.localeCompare(b.label),
      )
      .slice(0, 10);

    await this.searchCache.setCachedSuggestions(normalized, suggestions);

    return { suggestions };
  }

  private rank(label: string, keyword: string): number {
    const normalized = label.toLocaleLowerCase();
    const search = keyword.toLocaleLowerCase();
    return normalized === search ? 0 : normalized.startsWith(search) ? 1 : 2;
  }

  private getContentLabel(doc: {
    title: string;
    description?: string;
    platform?: string;
    metadata: Record<string, any>;
  }): string {
    const meta = doc.metadata || {};
    switch (doc.platform) {
      case 'facebook':
        return meta.message || doc.title || '';
      case 'instagram':
        return meta.caption || doc.title || '';
      case 'pinterest':
      case 'youtube':
        return doc.title || meta.description || '';
      default:
        return doc.title || '';
    }
  }
}
