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
import { LinkedInSearchResponseModel } from '../../../../domain/contracts/linkedin.model';
import {
  deserializeObject,
  serializeObject,
} from '../../../../core/utils/serialization.util';
import {
  ISearchHistoryRepository,
  IUserLoginRepository,
} from '../../../../domain/repositories';

export class LinkedInSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty({ required: false })
  linkedInAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class LinkedInSearchQuery {
  model: LinkedInSearchRequestModel;

  constructor(request: Partial<LinkedInSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(LinkedInSearchQuery)
export class LinkedInSearchQueryHandler implements IQueryHandler<LinkedInSearchQuery> {
  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  public async execute(
    command: LinkedInSearchQuery,
  ): Promise<LinkedInSearchResponseModel> {
    const { searchTerm, filter, linkedInAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (linkedInAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(linkedInAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin =
          await this.userLoginRepository.getByUserIdAndProviderAsync(
            userId,
            _const.PLATFORMS.LINKEDIN,
          );

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{
            access_token: string;
            refresh_token: string;
          }>(userLogin.tokenValue);
          const { access_token, expires_in } = await this.refreshTokenAsync(
            tokenValue.refresh_token,
          );
          if (access_token) {
            userLogin.tokenValue = serializeObject({
              access_token,
              refresh_token: tokenValue.refresh_token,
            });
            userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
          expiresIn = expires_in;
        }
      } else {
        accessToken = linkedInAccessToken;
      }
    } else {
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.LINKEDIN,
        );
      if (!userLogin) {
        throw new UnauthorizedException(
          'No LinkedIn account linked to your user profile. Please link your LinkedIn account to proceed.',
        );
      }

      const tokenValue = deserializeObject<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(
        tokenValue.access_token,
      );
      if (!isTokenValid) {
        const { access_token, expires_in } = await this.refreshTokenAsync(
          tokenValue.refresh_token,
        );
        userLogin.tokenValue = serializeObject({
          access_token,
          refresh_token: tokenValue.refresh_token,
        });
        userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
        await this.userLoginRepository.updateAsync(userLogin);
        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = tokenValue.expires_in;
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchLinkedInAsync({
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
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: configs.linkedin.clientId,
          client_secret: configs.linkedin.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException(
          'Your LinkedIn session has expired or the access token is invalid. Please log in to LinkedIn again to continue.',
        );
      }

      return {
        access_token,
        expires_in,
      };
    } catch (error) {
      logger.error('Error refreshing LinkedIn token', { error });
      throw new UnauthorizedException(
        'Your LinkedIn session has expired or the access token is invalid. Please log in to LinkedIn again to continue.',
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!response.data?.sub;
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
