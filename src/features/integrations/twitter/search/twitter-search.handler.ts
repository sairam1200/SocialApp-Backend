import axios from "axios";
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import fuseUtil from "../../../../core/utils/fuse.util";
import logger from "../../../../core/utils/winston.util";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { SearchHistory } from "../../../../domain/entities";
import { Inject, UnauthorizedException } from "@nestjs/common";
import { ApplicationException } from "../../../../core/exceptions";
import { ISearchService } from "../../../../domain/services/isearch.service";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { TwitterSearchResponseModel } from "../../../../domain/contracts/twitter.model";
import { deserializeObject, serializeObject } from "../../../../core/utils/serialization.util";
import { ISearchHistoryRepository, IUserLoginRepository } from "../../../../domain/repositories";

export class TwitterSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty({ required: false })
  twitterAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class TwitterSearchQuery {
  model: TwitterSearchRequestModel;

  constructor(request: Partial<TwitterSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(TwitterSearchQuery)
export class TwitterSearchQueryHandler implements IQueryHandler<TwitterSearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async execute(command: TwitterSearchQuery): Promise<TwitterSearchResponseModel> {
    const { searchTerm, filter, forceRefresh, twitterAccessToken } = command.model;

    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (twitterAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(twitterAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.TWITTER);

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{ access_token: string, refresh_token: string }>(userLogin.tokenValue);
          const { access_token, expires_in, refresh_token } = await this.refreshTokenAsync(tokenValue.refresh_token);
          if (access_token) {
            userLogin.tokenValue = serializeObject({ access_token, refresh_token });
            userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
        }
      } else {
        accessToken = twitterAccessToken;
      }
    } else {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.TWITTER);
      if (!userLogin) {
        throw new UnauthorizedException('No Twitter account linked to your user profile. Please link your Twitter account to proceed.');
      }

      const tokenValue = deserializeObject<{ access_token: string, refresh_token: string, expires_in: number }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
      if (!isTokenValid) {
        const { access_token, expires_in, refresh_token } = await this.refreshTokenAsync(tokenValue.refresh_token);
        userLogin.tokenValue = serializeObject({ access_token, refresh_token });
        userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
        await this.userLoginRepository.updateAsync(userLogin);
        accessToken = access_token;
      } else {
        accessToken = tokenValue.access_token;
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchTwitterAsync({
      page: 1,
      normalizedQuery,
      originalQuery: searchTerm,
      limit: 25,
      filters: filter || {},
      accessToken,
      forceRefresh: forceRefresh || false,
    });
    return data;
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number, refresh_token: string }> {
    try {
      const basicAuth = Buffer.from(`${configs.twitter.clientId}:${configs.twitter.clientSecret}`).toString('base64');

      const response = await axios.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
        },
      });

      const { access_token, expires_in, refresh_token } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Twitter session has expired or the access token is invalid. Please log in to Twitter again to continue.');
      }

      return {
        access_token,
        expires_in,
        refresh_token,
      };
    } catch (error) {
      logger.error("Error refreshing Twitter token", { error });
      throw new UnauthorizedException('Your Twitter session has expired or the access token is invalid. Please log in to Twitter again to continue.');
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!response.data?.data?.id;
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
      (await this.searchHistoryRepository.findSimilarQueriesAsync(trimmedQuery)) ?? [];

    const candidateValues = similarQueries
      .map((item) => item.normalizedQuery)
      .filter(Boolean)
      .slice(0, 50);

    const normalizedQuery = fuseUtil.normalizeSearchTerm(trimmedQuery, candidateValues);

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