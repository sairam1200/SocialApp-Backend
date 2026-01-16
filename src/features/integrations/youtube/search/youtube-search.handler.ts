import axios from "axios";
import { Inject } from "@nestjs/common";
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
import { YoutubeSearchResponseModel } from "../../../../domain/contracts/youtube.model";
import { deserializeObject, serializeObject } from "../../../../core/utils/serialization.util";
import { ISearchHistoryRepository, IUserLoginRepository } from "../../../../domain/repositories";

export class YoutubeSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  youtubeAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean; // If true, always fetch from YouTube API, ignoring cache
}

export class YoutubeSearchQuery {
  model: YoutubeSearchRequestModel;

  constructor(request: Partial<YoutubeSearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(YoutubeSearchQuery)
export class YoutubeSearchQueryHandler implements IQueryHandler<YoutubeSearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async execute(command: YoutubeSearchQuery): Promise<YoutubeSearchResponseModel> {
    const { searchTerm, filter, youtubeAccessToken } = command.model;

    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (youtubeAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(youtubeAccessToken);
      if (!isTokenValid && userId) {
        const now = new Date();
        const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.YOUTUBE);

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{ access_token: string, refresh_token: string }>(userLogin.tokenValue);
          const { access_token, expires_in } = await this.refreshTokenAsync(tokenValue.refresh_token);
          if (accessToken !== '') {
            userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token });
            userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
        }
      } else {
        accessToken = youtubeAccessToken;
      }
    } else if (userId) {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.YOUTUBE);
      if (userLogin) {
        const tokenValue = deserializeObject<{ access_token: string, refresh_token: string, expires_in: number }>(userLogin.tokenValue);
        const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
        if (!isTokenValid) {
          const {
            access_token,
            expires_in

          } = await this.refreshTokenAsync(tokenValue.refresh_token);
          userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token });
          userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
          await this.userLoginRepository.updateAsync(userLogin);
          accessToken = access_token;
        } else {
          accessToken = tokenValue.access_token;
        }
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchYoutubeAsync({
      page: 1,
      normalizedQuery,
      originalQuery: searchTerm,
      limit: 25,
      filters: filter,
      accessToken,
      forceRefresh: command.model.forceRefresh || false
    });
    return data
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number }> {
    try {

      const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: configs.youtube.clientId,
        client_secret: configs.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.');
      }

      return {
        access_token,
        expires_in,
      };

    } catch (error) {
      logger.error("Error refreshing YouTube token", { error });
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo`, {
        params: {
          access_token: accessToken,
        },
      });

      // If token is valid, response.data will contain info like expiry, user_id, scopes, etc.
      // If invalid, Google returns an error and axios will throw.
      return true;
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

    const userId = HttpContext.getCurrentUserId;
    if (!hasExistingEntry && normalizedQuery && userId) {
      await this.searchHistoryRepository.createAsync(
        new SearchHistory({
          originalQuery: trimmedQuery,
          userId,
          normalizedQuery,
        }),
      );
    }

    return normalizedQuery;
  }
}