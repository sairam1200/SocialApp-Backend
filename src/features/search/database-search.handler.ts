import * as Joi from "joi";
import { Inject, NotFoundException } from "@nestjs/common";
import { IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import _const from "../../core/utils/const";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { PagedResult } from "../../domain/contracts/pagination/pagedResult";
import { IUserContentRepository, IUserRepository } from "../../domain/repositories";
import { SearchContentProjection } from "../../domain/repositories/iuserContent.repository";
import { SearchUserProjection } from "../../domain/repositories/iuser.repository";
import { GetPublicProfileQuery } from "../profile/public-profile/get-public-profile.handler";

export type SearchSuggestion = {
  id: string;
  type: "user" | "userContent";
  label: string;
  userName?: string;
  href?: string;
  creatorName?: string;
};

export class SearchSuggestionsQuery {
  keyword: string;
  constructor(request: Partial<SearchSuggestionsQuery> = {}) { Object.assign(this, request); }
}

export class SearchResultsQuery {
  keyword: string;
  page = 1;
  limit = 20;
  constructor(request: Partial<SearchResultsQuery> = {}) { Object.assign(this, request); }
}

export class SearchItemQuery {
  id: string;
  type: "user" | "userContent";
  constructor(request: Partial<SearchItemQuery> = {}) { Object.assign(this, request); }
}

const keywordSchema = Joi.string().trim().min(1).max(200).required();
const suggestionsSchema = Joi.object<SearchSuggestionsQuery>({ keyword: keywordSchema.min(3) });
const resultsSchema = Joi.object<SearchResultsQuery>({
  keyword: keywordSchema,
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
const itemSchema = Joi.object<SearchItemQuery>({
  id: Joi.string().uuid().required(),
  type: Joi.string().valid("user", "userContent").required(),
});

@QueryHandler(SearchSuggestionsQuery)
export class SearchSuggestionsQueryHandler implements IQueryHandler<SearchSuggestionsQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY) private readonly contents: IUserContentRepository,
  ) {}

  async execute(query: SearchSuggestionsQuery): Promise<{ suggestions: SearchSuggestion[] }> {
    const value = await suggestionsSchema.validateAsync(query, { stripUnknown: true });
    const viewerId = HttpContext.getCurrentUserId!;
    const [[profiles], [contents]] = await Promise.all([
      this.users.searchGlobalAsync(value.keyword, viewerId, 1, 5),
      this.contents.searchGlobalAsync(value.keyword, viewerId, 1, 5),
    ]);
    const suggestions = [
      ...profiles.map(user => ({
        id: user.id, type: "user" as const,
        label: `${user.firstName} ${user.lastName}`.trim() || user.userName || "",
        userName: user.userName,
      })),
      ...contents.map(content => ({
        id: content.id,
        type: "userContent" as const,
        label: content.title,
        href: content.sourceUrl,
        creatorName: `${content.user.firstName} ${content.user.lastName}`.trim() || content.user.userName,
      })),
    ].sort((a, b) => this.rank(a.label, value.keyword) - this.rank(b.label, value.keyword)
      || a.label.localeCompare(b.label))
      .slice(0, 5);
    return { suggestions };
  }

  private rank(label: string, keyword: string): number {
    const normalized = label.toLocaleLowerCase();
    const search = keyword.toLocaleLowerCase();
    return normalized === search ? 0 : normalized.startsWith(search) ? 1 : 2;
  }
}

@QueryHandler(SearchResultsQuery)
export class SearchResultsQueryHandler implements IQueryHandler<SearchResultsQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY) private readonly contents: IUserContentRepository,
  ) {}

  async execute(query: SearchResultsQuery): Promise<{
    profiles: SearchUserProjection[];
    contents: SearchContentProjection[];
    pagination: { page: number; limit: number; profiles: PagedResult<null>; contents: PagedResult<null> };
  }> {
    const value = await resultsSchema.validateAsync(query, { stripUnknown: true });
    const viewerId = HttpContext.getCurrentUserId!;
    const [[profiles, profileTotal], [contents, contentTotal]] = await Promise.all([
      this.users.searchGlobalAsync(value.keyword, viewerId, value.page, value.limit),
      this.contents.searchGlobalAsync(value.keyword, viewerId, value.page, value.limit),
    ]);
    return {
      profiles,
      contents,
      pagination: {
        page: value.page,
        limit: value.limit,
        profiles: new PagedResult(null, profileTotal),
        contents: new PagedResult(null, contentTotal),
      },
    };
  }
}

@QueryHandler(SearchItemQuery)
export class SearchItemQueryHandler implements IQueryHandler<SearchItemQuery> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY) private readonly contents: IUserContentRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: SearchItemQuery): Promise<{ user?: unknown; content?: Omit<SearchContentProjection, "user"> }> {
    const value = await itemSchema.validateAsync(query, { stripUnknown: true });
    if (value.type === "user") {
      const user = await this.users.getUserByIdAsync(value.id);
      if (!user?.isActive || !user.userName) throw new NotFoundException("User not found");
      return { user: await this.queryBus.execute(new GetPublicProfileQuery({ userName: user.userName })) };
    }
    const content = await this.contents.getGlobalSearchItemAsync(value.id, HttpContext.getCurrentUserId!);
    if (!content) throw new NotFoundException("Content not found");
    const { user, ...item } = content;
    return { content: item, user };
  }
}
