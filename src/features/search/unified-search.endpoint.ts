import * as Joi from 'joi';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  SearchMode,
  SearchResultKind,
  SearchSourcePlatform,
  UnifiedSearchResponse,
} from '../../domain/contracts/unified-search.model';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import {
  UnifiedSearchService,
  normaliseTopic,
} from '../../infrastructure/services/search/unified-search.service';
import { SearchRateLimitGuard } from '../../core/passport/searchRateLimit.guard';

const querySchema = Joi.object({
  keyword: Joi.string().trim().max(200).allow('', null).default(''),
  mode: Joi.string()
    .valid(...Object.values(SearchMode))
    .default(SearchMode.All),
  page: Joi.number().integer().min(1).max(200).default(1),
  limit: Joi.number().integer().min(1).max(50).default(24),
  platforms: Joi.string().allow('', null),
  kinds: Joi.string().allow('', null),
  topics: Joi.string().max(400).allow('', null),
  seed: Joi.string().max(64).allow('', null),
});

/**
 * One search across everything, in one shape.
 *
 * Additive: `GET /search/results` is untouched and still returns its five
 * separate arrays. This is the endpoint that makes an "All" tab possible,
 * because it is the first thing to give every source a common shape.
 *
 * Anonymous callers get everything public. Signing in changes two things:
 * followers-only Community posts the reader may see are included, and For You
 * has affinities to rank against.
 */
@ApiTags('Search')
@Controller({ path: '/search', version: '1' })
// Public, and therefore rate limited.
//
// Being public is deliberate — search is the product's front door and must work before
// signup, exactly as `GlobalSearchController` is. But public *and unlimited* is the problem,
// not public alone, and this endpoint fans out further than any other: Community posts, Gaddr
// profiles, live channels, Gaddr Jobs listings and aggregated cross-platform content, in one
// request. It shares the `/search` prefix with a sibling controller that already carries this
// guard; without it here, the cheapest way to load the database was the newest endpoint.
@UseGuards(SearchRateLimitGuard)
export class UnifiedSearchController {
  constructor(private readonly search: UnifiedSearchService) {}

  @Get('unified')
  @ApiOperation({
    summary: 'Search everything, one shape',
    description:
      "Gaddr Community posts, Gaddr profiles, live channels, Gaddr Jobs projects and listings, and aggregated cross-platform content — normalised, fused on rank, and filterable by source and kind. `mode=for-you` ranks against the reader's topic affinities; `latest` is chronological; `random` is deterministic per seed so paging is stable.",
  })
  @ApiQuery({ name: 'mode', enum: SearchMode, required: false })
  @ApiQuery({
    name: 'platforms',
    required: false,
    description: 'Comma-separated, e.g. `gaddr,gaddr-jobs`',
  })
  @ApiQuery({
    name: 'kinds',
    required: false,
    description: 'Comma-separated, e.g. `video,job`',
  })
  @ApiQuery({
    name: 'topics',
    required: false,
    description:
      'Comma-separated themes, e.g. `design,fitness`. Matching any one is enough. Case- and `#`-insensitive.',
  })
  @ApiResponse({ status: 200, type: UnifiedSearchResponse })
  public async unified(
    @Query() query: Record<string, string>,
  ): Promise<UnifiedSearchResponse> {
    const value = await querySchema.validateAsync(query ?? {}, {
      stripUnknown: true,
    });

    const viewerUserId = HttpContext.getCurrentUserId;

    return this.search.searchAsync({
      keyword: value.keyword ?? '',
      mode: value.mode as SearchMode,
      viewerUserId:
        viewerUserId && viewerUserId.length > 0 ? viewerUserId : null,
      page: value.page,
      limit: value.limit,
      platforms: parseEnumList(value.platforms, SearchSourcePlatform),
      kinds: parseEnumList(value.kinds, SearchResultKind),
      topics: parseTopicList(value.topics),
      seed: value.seed || undefined,
    });
  }
}

/**
 * `"gaddr,youtube,nonsense"` → `[Gaddr, YouTube]`.
 *
 * Unknown values are dropped rather than rejected. A stale filter chip in a
 * bookmarked URL should narrow the results, not 400 the whole search.
 */
/**
 * `"Design, #fitness, ,"` → `["design", "fitness"]`.
 *
 * Themes are free text, so unlike the enum lists there is nothing to validate
 * against — only to normalise, the same way the service does, and to bound so
 * a hand-edited URL cannot turn one request into a hundred filters.
 */
export function parseTopicList(
  raw: string | undefined | null,
): string[] | undefined {
  if (!raw) return undefined;
  const parsed = Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => normaliseTopic(value))
        .filter((value) => value.length > 0 && value.length <= 64),
    ),
  ).slice(0, 20);
  return parsed.length > 0 ? parsed : undefined;
}

export function parseEnumList<T extends Record<string, string>>(
  raw: string | undefined | null,
  enumObject: T,
): Array<T[keyof T]> | undefined {
  if (!raw) return undefined;
  const allowed = new Set(Object.values(enumObject));
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.has(value as T[keyof T]));
  return parsed.length > 0 ? (parsed as Array<T[keyof T]>) : undefined;
}
