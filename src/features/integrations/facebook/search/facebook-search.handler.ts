import axios from 'axios';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import fuseUtil from '../../../../core/utils/fuse.util';
import logger from '../../../../core/utils/winston.util';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { SearchHistory } from '../../../../domain/entities';
import { Inject, UnauthorizedException } from '@nestjs/common';
import { ApplicationException } from '../../../../core/exceptions';
import { ISearchService } from '../../../../domain/services/isearch.service';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { FacebookSearchResponseModel } from '../../../../domain/contracts/facebook.model';
import {
  ISearchHistoryRepository,
  IUserLoginRepository,
} from '../../../../domain/repositories';

export class FacebookSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, string | number | boolean | string[]>;
  @ApiProperty({ required: false })
  facebookAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class FacebookSearchQuery {
  model: FacebookSearchRequestModel;

  constructor(request: Partial<FacebookSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(FacebookSearchQuery)
export class FacebookSearchQueryHandler
  implements IQueryHandler<FacebookSearchQuery, FacebookSearchResponseModel>
{
  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  public async execute(
    command: FacebookSearchQuery,
  ): Promise<FacebookSearchResponseModel> {
    const { searchTerm, filter, facebookAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (facebookAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(facebookAccessToken);
      if (isTokenValid) {
        accessToken = facebookAccessToken;
      } else {
        const now = new Date();
        const userLogin =
          await this.userLoginRepository.getByUserIdAndProviderAsync(
            userId,
            _const.PLATFORMS.FACEBOOK,
          );
        if (userLogin && now < userLogin.expiryDateUtc) {
          const { access_token, expires_in } = await this.refreshTokenAsync(
            userLogin.tokenValue,
          );

          userLogin.tokenValue = access_token;
          userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
          await this.userLoginRepository.updateAsync(userLogin);

          accessToken = access_token;
          expiresIn = expires_in;
        }
      }
    } else {
      // No token provided → use stored login
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.FACEBOOK,
        );

      const isTokenValid = await this.verifyAccessTokenAsync(
        userLogin.tokenValue,
      );
      if (!isTokenValid) {
        const { access_token, expires_in } = await this.refreshTokenAsync(
          userLogin.tokenValue,
        );

        userLogin.tokenValue = access_token;
        userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
        await this.userLoginRepository.updateAsync(userLogin);

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor(
          (userLogin.expiryDateUtc.getTime() - Date.now()) / 1000,
        );
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchFacebookAsync({
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

  private async refreshTokenAsync(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    try {
      const response = await axios.get(
        'https://graph.facebook.com/v23.0/oauth/access_token',
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: configs.facebook.clientId,
            client_secret: configs.facebook.clientSecret,
            fb_exchange_token: refreshToken,
          },
        },
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException(
          'Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.',
        );
      }

      return {
        access_token,
        expires_in,
      };
    } catch (error) {
      logger.error(
        `An error occurred while processing the Facebook import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );

      throw new UnauthorizedException(
        'Your Facebook session has expired or the access token is invalid. Please log in to Facebook again to continue.',
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const appAccessToken = `${configs.facebook.clientId}|${configs.facebook.clientSecret}`;

      const response = await axios.get(
        `https://graph.facebook.com/v23.0/debug_token`,
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
      logger.error(
        `An error occurred while processing the Facebook import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );

      return false;
      // throw new ApplicationException("Something went wrong while verifying the Facebook access token. Please try again later.");
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
