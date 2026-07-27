import axios from 'axios';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import fuseUtil from '../../../../core/utils/fuse.util';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { SearchHistory } from '../../../../domain/entities';
import { Inject, UnauthorizedException } from '@nestjs/common';
import { ISearchService } from '../../../../domain/services/isearch.service';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { SnapchatSearchResponseModel } from '../../../../domain/contracts/snapchat.model';
import {
  ISearchHistoryRepository,
  IUserLoginRepository,
} from '../../../../domain/repositories';

export class SnapchatSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  snapchatAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class SnapchatSearchQuery {
  model: SnapchatSearchRequestModel;

  constructor(request: Partial<SnapchatSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(SnapchatSearchQuery)
export class SnapchatSearchQueryHandler implements IQueryHandler<SnapchatSearchQuery> {
  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  public async execute(
    command: SnapchatSearchQuery,
  ): Promise<SnapchatSearchResponseModel> {
    const { searchTerm, filter, snapchatAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (snapchatAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(snapchatAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin =
          await this.userLoginRepository.getByUserIdAndProviderAsync(
            userId,
            _const.PLATFORMS.SNAPCHAT,
          );

        if (userLogin && now < userLogin.expiryDateUtc) {
          accessToken = userLogin.tokenValue;
          expiresIn = Math.floor(
            (userLogin.expiryDateUtc.getTime() - Date.now()) / 1000,
          );
        }
      } else {
        accessToken = snapchatAccessToken;
      }
    } else {
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.SNAPCHAT,
        );
      if (!userLogin) {
        throw new UnauthorizedException(
          'No Snapchat account linked to your user profile. Please link your Snapchat account to proceed.',
        );
      }

      const isTokenValid = await this.verifyAccessTokenAsync(
        userLogin.tokenValue,
      );
      if (!isTokenValid) {
        throw new UnauthorizedException(
          'Your Snapchat session has expired or the access token is invalid. Please log in to Snapchat again to continue.',
        );
      } else {
        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor(
          (userLogin.expiryDateUtc.getTime() - Date.now()) / 1000,
        );
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchSnapchatAsync({
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
      const response = await axios.get('https://kit.snapchat.com/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!response.data?.id;
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
