import axios from "axios";
import { Queue } from "bullmq";
import configs from "../../../../configs";
import { InjectQueue } from "@nestjs/bull";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { UserLogin } from "../../../../domain/entities";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";


export class SpotifyImportRequestModel {
  @ApiProperty()
  spotifyAccessToken: string;
}

export class SpotifyImportCommand {
  model: SpotifyImportRequestModel

  constructor(request: Partial<SpotifyImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SpotifyImportCommand)
export class SpotifyImportCommandHandler implements ICommandHandler<SpotifyImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.SPOTIFY_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(command: SpotifyImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {
    let expiresIn: number;
    const { spotifyAccessToken } = command.model;
    let accessToken: string | undefined;  
    const userId = HttpContext.getCurrentUserId;

    if (spotifyAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(spotifyAccessToken);
      const userLogin = await this.getUserLoginAsync(userId);
      if (!isTokenValid) {
        const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);  
        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = spotifyAccessToken;
        expiresIn = userLogin.expiryDateUtc.getTime() 
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);
      accessToken = access_token;
      expiresIn = expires_in;
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.SPOTIFY, userId);
    if (!account) {
      throw new NotFoundException(`Linked account not found for user ${userId}`);
    }

    try{
      console.log(`Adding Spotify import job to the queue for user ${userId} with access token ${accessToken}`);
      await this.importQueue.add( "SPOTIFY_IMPORT", {account,accessToken},{
          attempts: 3, backoff : 5000
        });

      console.log(`Spotify import job added to the queue for user ${userId}`);
    }catch(error){
      console.log(error)
      logger.error(`An error occurred while adding the Youtube import job to the queue: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to initiate Youtube import. Please try again later.');
    }

    return {
      accessToken,
      expiresIn
    }
  }




  private async refreshTokenAsync(refreshToken: string) :Promise<{access_token : string, expires_in: number}>{
    const basicAuth = Buffer.from(`${configs.spotify.clientId}:${configs.spotify.clientSecret}`).toString('base64')
    try{
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }).toString(),
          { 
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${basicAuth}`,
            },
          }
      )
      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new Error('Spotify did not return an access token.');
      }

      return {
        access_token,
        expires_in,
      };

    } catch (error) {
      console.error('Error refreshing Spotify token:', error);
      logger.error(`An error occurred while processing the Spotify import command: 
          ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

        throw new UnauthorizedException(
          'Your spotify session has expired or the access token is invalid. Please log in to Spotify again to continue.'
        );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean>{
    try{  
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Basic ${accessToken}`,
        }
      });
      return  !!response.data?.id;
    }catch(error) {
      if (error.response?.status === 401) {
        console.warn('Spotify access token is invalid or expired');
      } else {
        console.error('Spotify token verification error:', error.message);
      }

      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    try{
      const now = new Date();
      const userLogin=  await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.SPOTIFY
      );
  
      if(!userLogin){
        throw new UnauthorizedException(
          'No spotify account linked to your user profile. Please link your spotify account to proceed.'
        );
      }
      if (now > userLogin.expiryDateUtc) {
        throw new UnauthorizedException(
          'Your Spotify session has expired or the access token is invalid. Please log in to Spotify again to continue.'
        );
      }
      return userLogin;
    }catch(error) {
      logger.error(`An error occurred while fetching the Spotify user login: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new UnauthorizedException(
        'No Spotify account linked to your user profile. Please link your Spotify account to proceed.'
      );
    }
  }

}