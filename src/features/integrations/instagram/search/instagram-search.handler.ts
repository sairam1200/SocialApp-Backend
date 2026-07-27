import axios from 'axios';
import { Inject, UnauthorizedException } from '@nestjs/common';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import fuseUtil from '../../../../core/utils/fuse.util';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { SearchHistory } from '../../../../domain/entities';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { ISearchService } from '../../../../domain/services/isearch.service';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { InstagramSearchResponseModel } from '../../../../domain/contracts/instagram.model';
import { deserializeObject } from '../../../../core/utils/serialization.util';
import {
  ISearchHistoryRepository,
  IUserLoginRepository,
} from '../../../../domain/repositories';

export class InstagramSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty({ required: false })
  instagramAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class InstagramSearchQuery {
  model: InstagramSearchRequestModel;

  constructor(request: Partial<InstagramSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(InstagramSearchQuery)
export class InstagramSearchQueryHandler implements IQueryHandler<
  InstagramSearchQuery,
  InstagramSearchResponseModel
> {
  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  public async execute(
    command: InstagramSearchQuery,
  ): Promise<InstagramSearchResponseModel> {
    const { searchTerm, filter, instagramAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (instagramAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(instagramAccessToken);
      if (isTokenValid) {
        accessToken = instagramAccessToken;
      } else {
        const userLogin =
          await this.userLoginRepository.getByUserIdAndProviderAsync(
            userId,
            _const.PLATFORMS.INSTAGRAM,
          );

        if (userLogin) {
          const tokenValue = deserializeObject<{
            access_token: string;
            expires_in: number;
          }>(userLogin.tokenValue);
          const isDbTokenValid = await this.verifyAccessTokenAsync(
            tokenValue.access_token,
          );
          if (isDbTokenValid) {
            accessToken = tokenValue.access_token;
            expiresIn = tokenValue.expires_in;
          }
        }
      }
    } else {
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.INSTAGRAM,
        );
      if (!userLogin) {
        throw new UnauthorizedException(
          'No Instagram account linked to your user profile. Please link your Instagram account to proceed.',
        );
      }

      const tokenValue = deserializeObject<{
        access_token: string;
        expires_in: number;
      }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(
        tokenValue.access_token,
      );
      if (!isTokenValid) {
        throw new ApplicationException('RECONNECT_REQUIRED');
      }
      accessToken = tokenValue.access_token;
      expiresIn = tokenValue.expires_in;
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchInstagramAsync({
      page: 1,
      normalizedQuery,
      originalQuery: searchTerm,
      limit: 25,
      filters: filter || {},
      accessToken,
      forceRefresh: command.model.forceRefresh || false,
    });
    return data;
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const appAccessToken = `${configs.facebook.clientId}|${configs.facebook.clientSecret}`;

      const response = await axios.get(
        'https://graph.facebook.com/v23.0/debug_token',
        {
          params: {
            input_token: accessToken,
            access_token: appAccessToken,
          },
        },
      );

      const data = response.data.data;
      return data.is_valid;
    } catch (error) {
      return false;
    }
  }

  private async normalizeQueryAsync(query: string): Promise<string> {
    const trimmedQuery = (query ?? '').trim();
    if (!trimmedQuery) {
      return '';
    }

    const similarQueries =
      (await this.searchHistoryRepository.findSimilarQueriesAsync(
        trimmedQuery,
      )) ?? [];

    const candidateValues = similarQueries
      .map((item) => item.normalizedQuery)
      .filter(Boolean)
      .slice(0, 50);

    const normalizedQuery = fuseUtil.normalizeSearchTerm(
      trimmedQuery,
      candidateValues,
    );

    const hasExistingEntry = similarQueries.some((item) => {
      const original = (item.originalQuery ?? '').trim().toLowerCase();
      return (
        original === trimmedQuery.toLowerCase() ||
        item.normalizedQuery === normalizedQuery
      );
    });

    if (!hasExistingEntry && normalizedQuery) {
      await this.searchHistoryRepository.createAsync(
        new SearchHistory({
          originalQuery: trimmedQuery,
          userId: HttpContext.getCurrentUserId,
          normalizedQuery,
        }),
      );
    }

    return normalizedQuery;
  }
}
