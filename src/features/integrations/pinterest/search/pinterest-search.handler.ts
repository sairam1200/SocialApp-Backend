import axios from "axios";
import { Inject, UnauthorizedException } from "@nestjs/common";
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import fuseUtil from "../../../../core/utils/fuse.util";
import logger from "../../../../core/utils/winston.util";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { SearchHistory } from "../../../../domain/entities";
import { ApplicationException } from "../../../../core/exceptions";
import { ISearchService } from "../../../../domain/services/isearch.service";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { deserializeObject, serializeObject } from "../../../../core/utils/serialization.util";
import { ISearchHistoryRepository, IUserLoginRepository } from "../../../../domain/repositories";

export class PinterestSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  pinterestAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class PinterestSearchQuery {
  model: PinterestSearchRequestModel;

  constructor(request: Partial<PinterestSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(PinterestSearchQuery)
export class PinterestSearchQueryHandler implements IQueryHandler<PinterestSearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async execute(command: PinterestSearchQuery): Promise<any> {
    const { searchTerm, filter, pinterestAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (pinterestAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(pinterestAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.PINTEREST);

        if (userLogin && now < userLogin.expiryDateUtc) {
          const { access_token, expires_in, refresh_token, refresh_token_expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);
          if (access_token) {
            userLogin.tokenValue = refresh_token || userLogin.tokenValue;
            userLogin.expiryDateUtc = new Date(Date.now() + (refresh_token_expires_in || expires_in) * 1000);
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
          expiresIn = expires_in;
        }
      } else {
        accessToken = pinterestAccessToken;
      }
    } else {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.PINTEREST);
      if (!userLogin) {
        throw new UnauthorizedException('No Pinterest account linked to your user profile. Please link your Pinterest account to proceed.');
      }

      const isTokenValid = await this.verifyAccessTokenAsync(userLogin.tokenValue);
      if (!isTokenValid) {
        const { access_token, expires_in, refresh_token, refresh_token_expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);
        userLogin.tokenValue = refresh_token || userLogin.tokenValue;
        userLogin.expiryDateUtc = new Date(Date.now() + (refresh_token_expires_in || expires_in) * 1000);
        await this.userLoginRepository.updateAsync(userLogin);
        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - Date.now()) / 1000);
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchPinterestAsync(accessToken);
    return data;
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number, refresh_token?: string, refresh_token_expires_in?: number }> {
    try {
      const basicAuth = Buffer.from(`${configs.pinterest.clientId}:${configs.pinterest.clientSecret}`).toString('base64');

      const response = await axios.post(
        'https://api.pinterest.com/v5/oauth/token',
        `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          },
        },
      );

      const { access_token, expires_in, refresh_token, refresh_token_expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Pinterest session has expired or the access token is invalid. Please log in to Pinterest again to continue.');
      }

      return {
        access_token,
        expires_in,
        refresh_token,
        refresh_token_expires_in,
      };
    } catch (error) {
      logger.error("Error refreshing Pinterest token", { error });
      throw new UnauthorizedException('Your Pinterest session has expired or the access token is invalid. Please log in to Pinterest again to continue.');
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.pinterest.com/v5/user_account', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!response.data?.username;
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