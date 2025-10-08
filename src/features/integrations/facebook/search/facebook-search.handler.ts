import axios from 'axios';
import { Inject, UnauthorizedException } from '@nestjs/common';
import configs from '../../../../configs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import fuseUtil from '../../../../core/utils/fuse.util';
import logger from '../../../../core/utils/winston.util';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { SearchHistory } from '../../../../domain/entities';
import { ApplicationException } from '../../../../core/exceptions';
import { ISearchService } from '../../../../domain/services/isearch.service';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  deserializeObject,
  serializeObject,
} from '../../../../core/utils/serialization.util';
import {
  ISearchHistoryRepository,
  IUserLoginRepository,
} from '../../../../domain/repositories';

export class FacebookSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  facebookAccessToken?: string;
}

export class FacebookSearchQuery {
  model: FacebookSearchRequestModel;

  constructor(request: Partial<FacebookSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(FacebookSearchQuery)
export class FacebookSearchQueryHandler
  implements IQueryHandler<FacebookSearchQuery>
{
  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) {}

  public async execute(command: FacebookSearchQuery): Promise<any> {
    const { searchTerm, filter, facebookAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (facebookAccessToken) {
      const isTokenValid =
        await this.verifyAccessTokenAsync(facebookAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin =
          await this.userLoginRepository.getByUserIdAndProviderAsync(
            userId,
            _const.PLATFORMS.YOUTUBE,
          );

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{
            access_token: string;
            refresh_token: string;
          }>(userLogin.tokenValue);
          const { access_token, expires_in } = await this.refreshTokenAsync(
            tokenValue.refresh_token,
          );
          if (accessToken !== '') {
            userLogin.tokenValue = serializeObject({
              access_token,
              refresh_token: tokenValue.refresh_token,
            });
            userLogin.expiryDateUtc = new Date(
              Date.now() + 100 * 24 * 60 * 60 * 1000,
            ); // 100 days
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
          expiresIn = expires_in;
        }
      } else {
        accessToken = facebookAccessToken;
      }
    } else {
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.FACEBOOK,
        );
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
        userLogin.expiryDateUtc = new Date(
          Date.now() + 100 * 24 * 60 * 60 * 1000,
        ); // 100 days
        await this.userLoginRepository.updateAsync(userLogin);
        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = tokenValue.expires_in;
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchFacebookAsync({
      page: 1,
      normalizedQuery,
      originalQuery: searchTerm,
      limit: 25,
      filters: filter,
      accessToken,
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
    }
  }

  private async normalizeQueryAsync(query: string): Promise<string> {
    const searchHistory =
      await this.searchHistoryRepository.findSimilarQueriesAsync(query);
    console.log('Search history:', searchHistory);
    let normalizedQuery;
    if (searchHistory.length > 0) {
      const queries = searchHistory.map((item) => item.normalizedQuery);
      normalizedQuery = fuseUtil.normalizeSearchTerm(query, queries);
    } else {
      normalizedQuery = fuseUtil.normalizeSearchTerm(query, []);
    }

    await this.searchHistoryRepository.createAsync(
      new SearchHistory({
        originalQuery: query,
        userId: HttpContext.getCurrentUserId,
        normalizedQuery,
      }),
    );
    return normalizedQuery;
  }
}
