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

export class SpotifySearchRequestModel {
  @ApiProperty()
  searchTerm: string;
  @ApiProperty({ required: false })
  filter?: Record<string, any>;
  @ApiProperty({ required: false })
  spotifyAccessToken?: string;
  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class SpotifySearchQuery {
  model: SpotifySearchRequestModel;

  constructor(request: Partial<SpotifySearchQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(SpotifySearchQuery)
export class SpotifySearchQueryHandler implements IQueryHandler<SpotifySearchQuery> {

  constructor(
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
    @Inject(_const.ISEARCHHISTORY_REPOSITORY)
    private readonly searchHistoryRepository: ISearchHistoryRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async execute(command: SpotifySearchQuery): Promise<any> {
    const { searchTerm, filter, spotifyAccessToken } = command.model;

    let expiresIn: number;
    let accessToken: string | undefined;
    const userId = HttpContext.getCurrentUserId;

    if (spotifyAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(spotifyAccessToken);
      if (!isTokenValid) {
        const now = new Date();
        const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.SPOTIFY);

        if (userLogin && now < userLogin.expiryDateUtc) {
          const tokenValue = deserializeObject<{ access_token: string, refresh_token: string }>(userLogin.tokenValue);
          const { access_token, expires_in } = await this.refreshTokenAsync(tokenValue.refresh_token);
          if (access_token) {
            userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token });
            userLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
            await this.userLoginRepository.updateAsync(userLogin);
          }
          accessToken = access_token;
          expiresIn = expires_in;
        }
      } else {
        accessToken = spotifyAccessToken;
      }
    } else {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.SPOTIFY);
      if (!userLogin) {
        throw new UnauthorizedException('No Spotify account linked to your user profile. Please link your Spotify account to proceed.');
      }

      const tokenValue = deserializeObject<{ access_token: string, refresh_token: string, expires_in: number }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
      if (!isTokenValid) {
        const { access_token, expires_in } = await this.refreshTokenAsync(tokenValue.refresh_token);
        userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token });
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
    const data = await this.searchService.searchSpotifyAsync({
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

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number }> {
    try {
      const basicAuth = Buffer.from(`${configs.spotify.clientId}:${configs.spotify.clientSecret}`).toString('base64');

      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
        },
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Spotify session has expired or the access token is invalid. Please log in to Spotify again to continue.');
      }

      return {
        access_token,
        expires_in,
      };
    } catch (error) {
      logger.error("Error refreshing Spotify token", { error });
      throw new UnauthorizedException('Your Spotify session has expired or the access token is invalid. Please log in to Spotify again to continue.');
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
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

