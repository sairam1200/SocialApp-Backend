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
import { deserializeObject, serializeObject } from "../../../../core/utils/serialization.util";
import { ISearchHistoryRepository, IUserLoginRepository } from "../../../../domain/repositories";

export class YoutubeSearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty()
  youtubeAccessToken?: string;
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

  public async execute(command: YoutubeSearchQuery): Promise<any> {
    const { searchTerm, filter, youtubeAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (youtubeAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(youtubeAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.YOUTUBE);

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{ access_token: string, refresh_token: string }>(userLogin.tokenValue);
          const { access_token, refresh_token, expires_in } = await this.refreshTokenAsync(tokenValue.access_token);
          if (refresh_token !== '') {
            userLogin.tokenValue = serializeObject({ access_token, refresh_token });
            userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
            await this.userLoginRepository.updateAsync(userLogin);
          }

          accessToken = access_token;
          expiresIn = expires_in;
        }

      } else {
        accessToken = youtubeAccessToken;
      }
    } else {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.YOUTUBE);
      const tokenValue = deserializeObject<{ access_token: string, refresh_token: string, expires_in: number }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);

      if (!isTokenValid) {
        const {
          access_token,
          expires_in,
          refresh_token
        } = await this.refreshTokenAsync(tokenValue.refresh_token);

        userLogin.tokenValue = serializeObject({ access_token, refresh_token });
        userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
        await this.userLoginRepository.updateAsync(userLogin);

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = tokenValue.expires_in;
      }
    }

    const normalizedQuery = await this.normalizeQueryAsync(searchTerm);
    const data = await this.searchService.searchYoutubeAsync(normalizedQuery, 25, filter, accessToken);
    return data
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, refresh_token: string, expires_in: number }> {

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

      const { access_token, expires_in, refresh_token } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.');
      }

      return {
        access_token,
        expires_in,
        refresh_token
      };

    } catch (error) {
      logger.error(`An error occurred while processing the Youtube import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      return { access_token: '', expires_in: 0, refresh_token: '' }
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

    const searchHistory = await this.searchHistoryRepository.findSimilarQueriesAsync(query);
    let normalizedQuery;
    if (searchHistory.length > 0) {
      const queries = searchHistory.map(item => item.normalizedQuery);
      normalizedQuery = fuseUtil.normalizeSearchTerm(query, queries);
    } else {
      normalizedQuery = fuseUtil.normalizeSearchTerm(query, []);
    }

    await this.searchHistoryRepository.createAsync(new SearchHistory({
      originalQuery: query,
      userId: HttpContext.getCurrentUserId,
      normalizedQuery
    }));
    return normalizedQuery;
  }
}