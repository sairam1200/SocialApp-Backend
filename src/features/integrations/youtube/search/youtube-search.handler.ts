
import _const from "../../../../core/utils/const";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { IQueryHandler, QueryHandler} from "@nestjs/cqrs";
import { ApiProperty } from "@nestjs/swagger";
import { ILinkedAccountRepository, IUserLoginRepository } from "domain/repositories";
import { ISearchService } from "domain/services/isearch.service";
import { HttpContext } from "core/middlewares/httpContext.middleware";
import { Globals } from "core/globals";
import axios from "axios";
import configs from "configs";
import { ApplicationException } from "core/exceptions";
import { UserLogin } from "domain/entities";


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
  @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
  private readonly linkedAccountRepository: ILinkedAccountRepository,
  @Inject(_const.ISEARCH_SERVICE)
  private readonly searchService: ISearchService,
  @Inject(_const.IUSERLOGIN_REPOSITORY)
  private readonly userLoginRepository: IUserLoginRepository,
  
 ){}

  public async execute(command: YoutubeSearchQuery):Promise<any>{
    let expiresIn: number;
    const { searchTerm, filter, youtubeAccessToken } = command.model;
    let accessToken: string | undefined
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    if(youtubeAccessToken){
      const isTokenValid = await this.verifyAccessTokenAsync(youtubeAccessToken)
      if(!isTokenValid){
        const userLogin = await this.getUserLoginAsync(userId)
        const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);
        accessToken = access_token;
        expiresIn = expires_in;
      }else{
        accessToken = youtubeAccessToken
      }
    }else{
      const userLogin = await this.getUserLoginAsync(userId);
      const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);

      accessToken = access_token;
      expiresIn = expires_in;
    }
    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.YOUTUBE, userId);
    if (!account) {
      throw new NotFoundException("No matching Youtube profile was found!");

    }
    console.log("this is the access token used for search: ", accessToken)

    const data = await this.searchService.searchYoutubeAsync(searchTerm, 25, filter, youtubeAccessToken);
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
      throw new UnauthorizedException(
        'Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.'
      );
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

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.YOUTUBE
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Youtube account linked to your user profile. Please link your Youtube account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.'
      );
    }
    return userLogin;
  }



}